// ─── Types ───────────────────────────────────────────────────────────────────

export type Stage =
  | 'docs_received' | 'validation' | 'permit_applications'
  | 'entry_preparation' | 'tancis_registration' | 'assessment_payment'
  | 'tax_payment' | 'do_application' | 'inspection_booking'
  | 'transport_delivery' | 'completed';

export type Flag = 'green_channel' | 'yellow_channel' | 'red_channel'
  | 'demurrage' | 'sla_breach' | 'on_hold' | 'priority'
  | 'missing_doc' | 'penalty' | 'overspend';

export type Channel = 'internal' | 'whatsapp' | 'email' | 'sms' | 'teams';

export type DocType = 'invoice' | 'bl' | 'assessment' | 'release_order'
  | 'delivery_order' | 'icd_invoice' | 'tphpa' | 'receipt'
  | 'permit' | 'packing_list' | 'other';

export type TransportMode = 'SEA FCL' | 'SEA LCL' | 'AIR' | 'ROAD';

export interface Listener {
  id: string;
  listenerId?: string; // real shipment_listeners.id row PK — distinct from `id`, which is deliberately user_id-first for "already tagged" exclusion matching
  name: string;
  role: string;
  type: 'internal' | 'customer';
  channel: Channel[];
}

export interface ThreadMsg {
  id: string;
  userId: string;
  userName: string;
  content: string;
  ts: Date;
  channels: Channel[];
  isInternal: boolean;
  attachments?: string[];
  reactions?: { emoji: string; count: number }[];
}

export interface TimelineEvent {
  id: string;
  stage: Stage;
  label: string;
  userId: string;
  userName: string;
  ts: Date;
  note?: string;
  blocker?: string;
  automated?: boolean;
}

export interface ExtractedField {
  label: string;
  value: string;
  flag?: 'ok' | 'warn' | 'err';
}

export interface ExtractedSection {
  title: string;
  fields: ExtractedField[];
}

export interface ExtractedTable {
  title: string;
  headers: string[];
  rows: string[][];
  totalRow?: string[];
}

export interface ExtractedData {
  status: 'pending' | 'processing' | 'done' | 'failed';
  docType?: string;
  confidence?: number;
  sections?: ExtractedSection[];
  tables?: ExtractedTable[];
  summary?: string;
}

export interface ShipDoc {
  id: string;
  name: string;
  type: DocType;
  uploadedAt: Date;
  uploadedBy: string;
  size: string;
  extracted?: ExtractedData;
  apiType?: string;   // raw backend DocumentType (e.g. 'BL') — needed to call the real upload endpoint
  pending?: boolean;  // true when this is a REQUIRED placeholder with no file uploaded yet
}

export interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  currency: string;
  type: 'charge' | 'payment' | 'refund';
  date: Date;
  status: 'paid' | 'pending' | 'overdue';
  reference?: string;
}

export type TaskStatus   = 'not_started' | 'in_progress' | 'testing' | 'awaiting_feedback' | 'complete';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface InternalTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: string[];
  startDate: Date;
  dueDate: Date;
  tags: string[];
  description?: string;
  timeEstimateH?: number;
  productId?: string;
  serviceName?: string;
  serviceRate?: number;
  serviceCurrency?: string;
  serviceUnit?: string;
}

export interface TimeEntry {
  id: string;
  memberId: string;
  memberName: string;
  taskId: string;
  taskTitle: string;
  duration: string;
  hours: number;
  date: Date;
  billable: boolean;
  note?: string;
  productId?: string;
  serviceName?: string;
  serviceRate?: number;
  serviceCurrency?: string;
  serviceUnit?: string;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  userName: string;
  action: 'added' | 'updated' | 'stage_change' | 'uploaded' | 'commented' | 'assigned' | 'extracted' | 'payment' | 'task_done';
  subject: string;
  detail?: string;
  ts: Date;
}

export interface CloudLink {
  id: string;
  provider: 'gdrive' | 'onedrive' | 'box' | 'dropbox' | 'gsheets' | 'sharepoint';
  name: string;
  url: string;
  linkedAt: Date;
  linkedBy: string;
}

export interface ClearanceJob {
  id: string;
  title: string;
  sysRef?: string;
  customer: string;
  customerId: string;
  mode: TransportMode;
  origin: string;
  destination: string;
  bl?: string;
  tansad?: string;
  vessel?: string;
  containers?: string[];
  weight?: string;
  invoiceValue?: string;
  currency?: string;
  stage: Stage;
  flags: Flag[];
  assignees: string[];
  listeners: Listener[];
  createdAt: Date;
  dueDate?: Date;
  thread: ThreadMsg[];
  timeline: TimelineEvent[];
  ledger: LedgerEntry[];
  documents: ShipDoc[];
  tasks: InternalTask[];
  timeEntries: TimeEntry[];
  activity: ActivityEvent[];
  cloudLinks: CloudLink[];
  co2EmissionsKg?: number;
  carbonCreditsSaved?: number;
  co2CalcDetails?: any;
  customerContactName?: string;
  customerEmail?: string;
  customerPhone?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  assigneePhone?: string;
  whatsappBotActive?: boolean;
  // Set only for shipments governed by a tenant-defined custom workflow —
  // `stage` above has already been collapsed to a generic local Stage by
  // toStage() (it can't map a workflow_steps.id to the fixed 11-stage
  // taxonomy), so CustomerMilestoneTimeline needs this + isDone to render an
  // honest 2-state view instead of silently claiming "Docs Received" no
  // matter how far along the shipment actually is.
  workflowId?: string | null;
  isDone?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const STAGES: { id: Stage; label: string; short: string; color: string }[] = [
  { id: 'docs_received',        label: 'Docs Received',        short: 'Docs',     color: '#7c3aed' },
  { id: 'validation',           label: 'Validation',           short: 'Valid.',   color: '#ea580c' },
  { id: 'permit_applications',  label: 'Permit Applications',  short: 'Permits',  color: '#d97706' },
  { id: 'entry_preparation',    label: 'Entry Preparation',    short: 'Entry',    color: '#2563eb' },
  { id: 'tancis_registration',  label: 'TANCIS Registration',  short: 'TANCIS',   color: '#0891b2' },
  { id: 'assessment_payment',   label: 'Assessment & Payment', short: 'Assess.',  color: '#059669' },
  { id: 'tax_payment',          label: 'Tax Payment',          short: 'Tax',      color: '#dc2626' },
  { id: 'do_application',       label: 'DO Application',       short: 'DO App',   color: '#7c3aed' },
  { id: 'inspection_booking',   label: 'Inspection Booking',   short: 'Inspect.', color: '#6366f1' },
  { id: 'transport_delivery',   label: 'Transport & Delivery', short: 'Delivery', color: '#0d9488' },
  { id: 'completed',            label: 'Completed',            short: 'Done',     color: '#059669' },
];

export function stageIdx(s: Stage) { return STAGES.findIndex(x => x.id === s); }

// Maps local Stage IDs → backend ClearanceStage keys (used when sending stage transitions to API)
export const STAGE_API_MAP: Record<Stage, string> = {
  docs_received:       'DOCS_RECEIVED',
  validation:          'VALIDATION',
  permit_applications: 'PERMITS',
  entry_preparation:   'ENTRY_PREP',
  tancis_registration: 'TANCIS_REG',
  assessment_payment:  'ASSESSMENT',
  tax_payment:         'TAX_PAYMENT',
  do_application:      'DO_APPLICATION',
  inspection_booking:  'INSPECTION_BOOKING',
  transport_delivery:  'DELIVERY',
  completed:           'CLOSED',
};

// Maps backend ClearanceStage keys → local Stage IDs (used when reading stage from API response)
export const API_STAGE_MAP: Record<string, Stage> = {
  DOCS_RECEIVED:    'docs_received',
  VALIDATION:       'validation',
  PERMITS:          'permit_applications',
  ENTRY_PREP:       'entry_preparation',
  TANCIS_REG:       'tancis_registration',
  ASSESSMENT:       'assessment_payment',
  TAX_PAYMENT:      'tax_payment',
  DO_APPLICATION:   'do_application',
  INSPECTION_BOOKING: 'inspection_booking',
  INSPECTION:       'inspection_booking',
  GOV_REMARKS:      'inspection_booking',
  RELEASE:          'transport_delivery',
  ICD_PAYMENT:      'transport_delivery',
  GATE_PASS:        'transport_delivery',
  TRANSPORT:        'transport_delivery',
  DELIVERY:         'transport_delivery',
  EMPTY_RETURN:     'completed',
  INVOICING:        'completed',
  CLOSED:           'completed',
};

export const FLAG_CFG: Record<Flag, { label: string; color: string; icon: string }> = {
  green_channel:  { label: 'Green Channel',  color: '#059669', icon: 'checkCircle' },
  yellow_channel: { label: 'Yellow Channel', color: '#ca8a04', icon: 'alertTriangle' },
  red_channel:    { label: 'Red Channel',    color: '#dc2626', icon: 'alertCircle' },
  demurrage:      { label: 'DEMURRAGE',      color: '#ea580c', icon: 'alertTriangle' },
  sla_breach:     { label: 'SLA_BREACH',     color: '#dc2626', icon: 'zap' },
  on_hold:        { label: 'ON HOLD',        color: '#6b7280', icon: 'pause' },
  priority:       { label: 'PRIORITY',       color: '#7c3aed', icon: 'star' },
  missing_doc:    { label: 'MISSING DOC',    color: '#b45309', icon: 'file' },
  penalty:        { label: 'PENALTY',        color: '#dc2626', icon: 'alertCircle' },
  overspend:      { label: 'OVERSPEND',      color: '#dc2626', icon: 'alertTriangle' },
};

export const CH_CFG: Record<Channel, { label: string; color: string; bg: string }> = {
  internal: { label: 'Internal',  color: '#6b7280', bg: '#f3f4f6' },
  whatsapp: { label: 'WhatsApp',  color: '#059669', bg: '#ecfdf5' },
  email:    { label: 'Email',     color: '#2563eb', bg: '#dbeafe' },
  sms:      { label: 'SMS',       color: '#7c3aed', bg: '#ede9fe' },
  teams:    { label: 'Teams',     color: '#6264a7', bg: '#e0e7ff' },
};

export const CUSTOMERS_LIST = [
  'Timeline Company Limited', 'Dangote Industries Ltd',
  'Muhimbili National Hospital', 'TTCL Tanzania', 'Stanbic Bank Tanzania',
  'Vodacom Tanzania', 'TANESCO', '+ Onboard new customer',
];

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_TASKS_1: InternalTask[] = [
  { id: 'tk1', title: 'Collect & verify shipping documents', status: 'complete', priority: 'high', assignees: ['Baraka Osei'], startDate: new Date('2026-02-11'), dueDate: new Date('2026-02-11'), tags: ['docs'], timeEstimateH: 2 },
  { id: 'tk2', title: 'Submit TANCIS entry declaration', status: 'complete', priority: 'high', assignees: ['Baraka Osei'], startDate: new Date('2026-02-12'), dueDate: new Date('2026-02-12'), tags: ['tancis'], timeEstimateH: 4 },
  { id: 'tk3', title: 'Review TRA customs value assessment', status: 'complete', priority: 'urgent', assignees: ['Amina Rashid', 'Baraka Osei'], startDate: new Date('2026-02-13'), dueDate: new Date('2026-02-13'), tags: ['tansad', 'assessment'], description: 'Value uplifted 2× — need finance sign-off' },
  { id: 'tk4', title: 'Process duty & tax payment (TZS 22.1M)', status: 'complete', priority: 'urgent', assignees: ['James Mwangi'], startDate: new Date('2026-02-14'), dueDate: new Date('2026-02-14'), tags: ['finance'], timeEstimateH: 1 },
  { id: 'tk5', title: 'Obtain Delivery Order from COSCO', status: 'complete', priority: 'high', assignees: ['Baraka Osei'], startDate: new Date('2026-02-15'), dueDate: new Date('2026-02-15'), tags: ['do'] },
  { id: 'tk6', title: 'Apply for Pharmacy Board permit (OGA)', status: 'complete', priority: 'medium', assignees: ['Baraka Osei'], startDate: new Date('2026-02-12'), dueDate: new Date('2026-02-13'), tags: ['permit', 'oga'] },
  { id: 'tk7', title: 'Book & coordinate joint inspection at Silver ICD', status: 'in_progress', priority: 'high', assignees: ['Baraka Osei', 'Amina Rashid'], startDate: new Date('2026-02-16'), dueDate: new Date('2026-02-17'), tags: ['inspection'], timeEstimateH: 3 },
  { id: 'tk8', title: 'Arrange 2 trucks for container transport', status: 'awaiting_feedback', priority: 'high', assignees: ['Baraka Osei'], startDate: new Date('2026-02-17'), dueDate: new Date('2026-02-18'), tags: ['transport'], description: 'Awaiting client confirmation of delivery address' },
  { id: 'tk9', title: 'Confirm delivery to client warehouse & close file', status: 'not_started', priority: 'medium', assignees: ['Baraka Osei'], startDate: new Date('2026-02-18'), dueDate: new Date('2026-02-20'), tags: ['closing'] },
];

const MOCK_TIME_1: TimeEntry[] = [
  { id: 'te1', memberId: 'u1', memberName: 'Baraka Osei',   taskId: 'tk1', taskTitle: 'Collect & verify shipping documents', duration: '02:30:00', hours: 2.50, date: new Date('2026-02-11'), billable: true  },
  { id: 'te2', memberId: 'u1', memberName: 'Baraka Osei',   taskId: 'tk2', taskTitle: 'Submit TANCIS entry declaration',      duration: '04:15:00', hours: 4.25, date: new Date('2026-02-12'), billable: true  },
  { id: 'te3', memberId: 'u2', memberName: 'Amina Rashid',  taskId: 'tk3', taskTitle: 'Review TRA customs value assessment',  duration: '01:45:00', hours: 1.75, date: new Date('2026-02-13'), billable: true  },
  { id: 'te4', memberId: 'u1', memberName: 'Baraka Osei',   taskId: 'tk3', taskTitle: 'Review TRA customs value assessment',  duration: '00:45:00', hours: 0.75, date: new Date('2026-02-13'), billable: true  },
  { id: 'te5', memberId: 'u3', memberName: 'James Mwangi',  taskId: 'tk4', taskTitle: 'Process duty & tax payment',           duration: '00:30:00', hours: 0.50, date: new Date('2026-02-14'), billable: false },
  { id: 'te6', memberId: 'u1', memberName: 'Baraka Osei',   taskId: 'tk5', taskTitle: 'Obtain Delivery Order from COSCO',     duration: '01:00:00', hours: 1.00, date: new Date('2026-02-15'), billable: true  },
  { id: 'te7', memberId: 'u1', memberName: 'Baraka Osei',   taskId: 'tk7', taskTitle: 'Book & coordinate joint inspection',   duration: '02:00:00', hours: 2.00, date: new Date('2026-02-16'), billable: true  },
  { id: 'te8', memberId: 'u2', memberName: 'Amina Rashid',  taskId: 'tk7', taskTitle: 'Book & coordinate joint inspection',   duration: '01:30:00', hours: 1.50, date: new Date('2026-02-16'), billable: true  },
];

const MOCK_ACTIVITY_1: ActivityEvent[] = [
  { id: 'a1',  userId: 'system', userName: 'System',        action: 'added',        subject: 'Clearance job CLR-2026-0001 created',                  ts: new Date('2026-02-11T08:00:00') },
  { id: 'a2',  userId: 'u1',     userName: 'Baraka Osei',   action: 'uploaded',     subject: 'COSU6441534213_BL.pdf',                                ts: new Date('2026-02-11T08:05:00') },
  { id: 'a3',  userId: 'u1',     userName: 'Baraka Osei',   action: 'uploaded',     subject: 'Invoice_SL-2026-CN-00412.pdf',                         ts: new Date('2026-02-11T08:10:00') },
  { id: 'a4',  userId: 'u1',     userName: 'Baraka Osei',   action: 'stage_change', subject: 'Stage: Docs Received → Validation',                    ts: new Date('2026-02-11T11:00:00') },
  { id: 'a5',  userId: 'u1',     userName: 'Baraka Osei',   action: 'extracted',    subject: 'AI extracted B/L data — 97% confidence',               ts: new Date('2026-02-11T11:30:00') },
  { id: 'a6',  userId: 'u1',     userName: 'Baraka Osei',   action: 'stage_change', subject: 'Stage: Validation → Entry Preparation',                ts: new Date('2026-02-12T09:00:00') },
  { id: 'a7',  userId: 'u1',     userName: 'Baraka Osei',   action: 'stage_change', subject: 'Stage: Entry Prep → TANCIS Registration',              ts: new Date('2026-02-12T14:30:00'), detail: 'TANSAD: TZDL261095360' },
  { id: 'a8',  userId: 'u2',     userName: 'Amina Rashid',  action: 'uploaded',     subject: 'TRA_Assessment_TZDL261095360.pdf',                     ts: new Date('2026-02-13T16:00:00') },
  { id: 'a9',  userId: 'u2',     userName: 'Amina Rashid',  action: 'stage_change', subject: 'Stage: TANCIS Reg → Assessment & Payment',             ts: new Date('2026-02-13T16:05:00'), detail: '⚠ Customs value uplifted 2×' },
  { id: 'a10', userId: 'u2',     userName: 'Amina Rashid',  action: 'extracted',    subject: 'AI extracted TRA Assessment — value discrepancy flagged',ts: new Date('2026-02-13T16:30:00') },
  { id: 'a11', userId: 'u3',     userName: 'James Mwangi',  action: 'payment',      subject: 'Tax payment confirmed — TZS 22,136,845',               ts: new Date('2026-02-15T08:00:00'), detail: 'Ref: CRDB-26-887234' },
  { id: 'a12', userId: 'u1',     userName: 'Baraka Osei',   action: 'stage_change', subject: 'Stage: Assessment → Tax Payment',                      ts: new Date('2026-02-15T08:05:00') },
  { id: 'a13', userId: 'u1',     userName: 'Baraka Osei',   action: 'task_done',    subject: 'Task completed: Obtain Delivery Order from COSCO',      ts: new Date('2026-02-15T10:00:00') },
  { id: 'a14', userId: 'u1',     userName: 'Baraka Osei',   action: 'stage_change', subject: 'Stage: DO Application → Inspection Booking',           ts: new Date('2026-02-16T09:00:00'), detail: 'Joint inspection: Feb 17th @ Silver ICD' },
  { id: 'a15', userId: 'u1',     userName: 'Baraka Osei',   action: 'uploaded',     subject: 'SilverICD_Invoice_26-4421.pdf',                        ts: new Date('2026-02-16T09:05:00') },
  { id: 'a16', userId: 'u1',     userName: 'Baraka Osei',   action: 'assigned',     subject: 'Amina Rashid assigned to joint inspection task',        ts: new Date('2026-02-16T09:10:00') },
];

const MOCK_CLOUD_1: CloudLink[] = [
  { id: 'cl1', provider: 'gdrive',    name: 'CLR-2026-0001 Shared Folder', url: 'https://drive.google.com/drive/folders/abc123', linkedAt: new Date('2026-02-11'), linkedBy: 'Baraka Osei' },
  { id: 'cl2', provider: 'gsheets',  name: 'Duty Calculation Sheet',       url: 'https://docs.google.com/spreadsheets/d/xyz456', linkedAt: new Date('2026-02-13'), linkedBy: 'James Mwangi' },
];

const MOCK_LISTENERS_1: Listener[] = [
  { id: 'u1', name: 'Baraka Osei',   role: 'Clearance Officer', type: 'internal', channel: ['internal', 'email'] },
  { id: 'u2', name: 'Amina Rashid',  role: 'Senior Manager',    type: 'internal', channel: ['internal', 'teams'] },
  { id: 'u3', name: 'James Mwangi',  role: 'Finance',           type: 'internal', channel: ['internal'] },
  { id: 'c1', name: 'Samuel Bello',  role: 'Procurement Mgr',   type: 'customer', channel: ['whatsapp', 'email'] },
  { id: 'c2', name: 'Ngozi Adeyemi', role: 'Logistics Coord.',  type: 'customer', channel: ['whatsapp'] },
];

const MOCK_THREAD_1: ThreadMsg[] = [
  { id: 't1', userId: 'u1', userName: 'Baraka Osei', content: 'Docs received from shipper. Packing list, invoice and B/L confirmed. Starting validation.', ts: new Date('2026-02-11T08:30:00'), channels: ['internal'], isInternal: true },
  { id: 't2', userId: 'u1', userName: 'Baraka Osei', content: 'Good morning, we have received your shipping documents and are starting the clearance process. Estimated clearance: 7–10 working days.', ts: new Date('2026-02-11T09:00:00'), channels: ['whatsapp', 'email'], isInternal: false, reactions: [{ emoji: '👍', count: 2 }] },
  { id: 't3', userId: 'c1', userName: 'Samuel Bello', content: 'Thank you. Please expedite — we have a production deadline on Feb 20th.', ts: new Date('2026-02-11T09:45:00'), channels: ['whatsapp'], isInternal: false },
  { id: 't4', userId: 'u2', userName: 'Amina Rashid', content: 'INTERNAL: Customs value uplift flagged by TRA. Assessed FOB is TZS 60.4M vs declared TZS 27.4M. Need finance sign-off before proceeding.', ts: new Date('2026-02-12T14:00:00'), channels: ['internal'], isInternal: true },
  { id: 't5', userId: 'u1', userName: 'Baraka Osei', content: 'Assessment document received from TRA. Total duty assessment: TZS 22.1M. Sending payment advice now.', ts: new Date('2026-02-14T10:20:00'), channels: ['whatsapp', 'email', 'teams'], isInternal: false, attachments: ['Assessment_TZDL261095360.pdf'], reactions: [{ emoji: '👀', count: 1 }] },
  { id: 't6', userId: 'c1', userName: 'Samuel Bello', content: 'Payment initiated. Transfer ref: CRDB-26-887234. Should reflect within 24 hours.', ts: new Date('2026-02-14T15:30:00'), channels: ['whatsapp'], isInternal: false },
  { id: 't7', userId: 'u3', userName: 'James Mwangi', content: 'Payment confirmed on our end. Proceeding with DO application and inspection booking.', ts: new Date('2026-02-15T08:00:00'), channels: ['internal', 'whatsapp'], isInternal: false },
];

const MOCK_TIMELINE_1: TimelineEvent[] = [
  { id: 'e1', stage: 'docs_received',       label: 'Docs Received',       userId: 'u1', userName: 'Baraka Osei',  ts: new Date('2026-02-11T08:30:00'), note: 'All documents received: Invoice, B/L, Packing List' },
  { id: 'e2', stage: 'validation',           label: 'Validation',          userId: 'u1', userName: 'Baraka Osei',  ts: new Date('2026-02-11T11:00:00'), note: 'Documents validated. Minor discrepancy in quantity on packing list corrected.' },
  { id: 'e3', stage: 'entry_preparation',    label: 'Entry Preparation',   userId: 'u1', userName: 'Baraka Osei',  ts: new Date('2026-02-12T09:00:00') },
  { id: 'e4', stage: 'tancis_registration',  label: 'TANCIS Registration', userId: 'u1', userName: 'Baraka Osei',  ts: new Date('2026-02-12T14:30:00'), note: 'Declaration submitted under TZDL261095360' },
  { id: 'e5', stage: 'assessment_payment',   label: 'Assessment & Payment',userId: 'u2', userName: 'Amina Rashid', ts: new Date('2026-02-13T10:00:00'), note: 'TRA assessment received. Customs value uplifted significantly.' },
  { id: 'e6', stage: 'tax_payment',          label: 'Tax Payment',         userId: 'u3', userName: 'James Mwangi', ts: new Date('2026-02-15T08:00:00'), note: 'Payment confirmed. Ref: CRDB-26-887234' },
  { id: 'e7', stage: 'do_application',       label: 'DO Application',      userId: 'u1', userName: 'Baraka Osei',  ts: new Date('2026-02-15T10:00:00'), note: 'DO obtained from COSCO. Container released.' },
  { id: 'e8', stage: 'inspection_booking',   label: 'Inspection Booking',  userId: 'u1', userName: 'Baraka Osei',  ts: new Date('2026-02-16T09:00:00'), note: 'Joint inspection booked for Feb 17th at Silver ICD.' },
];

const MOCK_DOCS_1: ShipDoc[] = [
  {
    id: 'd1', name: 'COSU6441534213_BL.pdf', type: 'bl',
    uploadedAt: new Date('2026-02-11T08:00:00'), uploadedBy: 'Samuel Bello', size: '412 KB',
    extracted: {
      status: 'done', docType: 'Bill of Lading', confidence: 97,
      sections: [
        { title: 'Shipment Info', fields: [
          { label: 'B/L Number', value: 'COSU6441534213', flag: 'ok' },
          { label: 'Carrier', value: 'COSCO SHIPPING' },
          { label: 'Vessel', value: 'CAPE FLORES' },
          { label: 'Port of Loading', value: 'Nansha, China (CNNSA)' },
          { label: 'Port of Discharge', value: 'Dar es Salaam (TZDW)' },
          { label: 'ETA', value: '04/02/2026' },
        ]},
        { title: 'Cargo', fields: [
          { label: 'Description', value: 'Crusher Accessories & Spare Parts' },
          { label: 'Packages', value: '339 PK' },
          { label: 'Gross Weight', value: '23,535 KGS' },
          { label: 'Container 1', value: 'CSNU2541982 (20GP)' },
          { label: 'Container 2', value: 'COSU7812345 (40HQ)' },
        ]},
        { title: 'Parties', fields: [
          { label: 'Shipper', value: 'Shanghai Lofida Supply Chain Co., Ltd' },
          { label: 'Consignee', value: 'Timeline Company Limited' },
          { label: 'Notify Party', value: 'Aleka Holdings Limited' },
        ]},
      ],
      summary: 'Bill of Lading for 339 packages (2 containers) of Crusher Accessories shipped via COSCO from Nansha to Dar es Salaam.',
    },
  },
  {
    id: 'd2', name: 'Invoice_SL-2026-CN-00412.pdf', type: 'invoice',
    uploadedAt: new Date('2026-02-11T08:05:00'), uploadedBy: 'Samuel Bello', size: '198 KB',
    extracted: {
      status: 'done', docType: 'Commercial Invoice', confidence: 95,
      sections: [
        { title: 'Invoice Details', fields: [
          { label: 'Invoice No.', value: 'SL-2026-CN-00412', flag: 'ok' },
          { label: 'Invoice Date', value: '15/01/2026' },
          { label: 'Total Invoice Value', value: 'USD 23,553.59', flag: 'ok' },
          { label: 'Incoterms', value: 'FOB Nansha' },
        ]},
        { title: 'Parties', fields: [
          { label: 'Seller', value: 'Shanghai Lofida Supply Chain Co., Ltd' },
          { label: 'Buyer', value: 'Timeline Company Limited, Tanzania' },
          { label: 'Payment Terms', value: 'T/T 30 days' },
        ]},
      ],
      tables: [
        { title: 'Line Items (Sample)', headers: ['#', 'Description', 'HS Code', 'Qty', 'Unit Price', 'Total'], rows: [
          ['1', 'Jaw Plate (Fixed)', '8474.90.00', '12', 'USD 350.00', 'USD 4,200.00'],
          ['2', 'Jaw Plate (Swing)', '8474.90.00', '12', 'USD 330.00', 'USD 3,960.00'],
          ['3', 'Eccentric Shaft', '8483.10.00', '4', 'USD 620.00', 'USD 2,480.00'],
          ['4', 'Toggle Plate', '8474.90.00', '8', 'USD 185.00', 'USD 1,480.00'],
          ['…', '(197 more items)', '', '', '', '…'],
        ], totalRow: ['', '', '', '201 items', '', 'USD 23,553.59'] },
      ],
      summary: 'Commercial invoice for 201 line items of crusher spare parts. Total FOB: USD 23,553.59.',
    },
  },
  {
    id: 'd3', name: 'TRA_Assessment_TZDL261095360.pdf', type: 'assessment',
    uploadedAt: new Date('2026-02-13T16:00:00'), uploadedBy: 'Baraka Osei', size: '4.2 MB',
    extracted: {
      status: 'done', docType: 'TRA Customs Assessment', confidence: 92,
      sections: [
        { title: 'Declaration Info', fields: [
          { label: 'TANSAD Number', value: 'TZDL261095360', flag: 'ok' },
          { label: 'Entry Date', value: '11/02/2026' },
          { label: 'Declaration Type', value: 'IM4 (Home Use)' },
          { label: 'Entry Office', value: 'Dar Customs Service Centre' },
          { label: 'Location of Goods', value: 'WITZDL019 — Silver ICD' },
          { label: 'Receipt No.', value: '926052412250245' },
        ]},
        { title: 'Trade Operators', fields: [
          { label: 'Exporter', value: 'Shanghai Lofida Supply Chain Co., Ltd' },
          { label: 'Importer', value: 'Timeline Company Limited' },
          { label: 'Importer TIN', value: '152-013-019', flag: 'ok' },
          { label: 'Declarant', value: 'Aleka Holdings Limited' },
          { label: 'Declarant TIN', value: '137-644-169' },
        ]},
        { title: 'Transport', fields: [
          { label: 'Mode', value: 'Sea (1)' },
          { label: 'B/L Number', value: 'COSU6441534213', flag: 'ok' },
          { label: 'Vessel', value: 'CAPE FLORES' },
          { label: 'Packages', value: '339 PK' },
          { label: 'Gross Weight', value: '23,535 KGS' },
        ]},
        { title: 'Financial — ⚠ Uplift Detected', fields: [
          { label: 'Exchange Rate', value: 'TZS 2,568.08/USD' },
          { label: 'Declared Invoice Value', value: 'USD 23,553.59' },
          { label: 'Declared FOB (TZS)', value: '27,481,563', flag: 'warn' },
          { label: 'ASSESSED FOB (TZS)', value: '60,487,506', flag: 'err' },
          { label: 'Declared CIF (TZS)', value: '31,369,636', flag: 'warn' },
          { label: 'ASSESSED CIF (TZS)', value: '64,375,579', flag: 'err' },
          { label: 'Uplift Factor', value: '2.05× (105% uplift)', flag: 'err' },
        ]},
        { title: 'Tax Summary', fields: [
          { label: 'Import Duty (IMP)', value: 'TZS 9,245,230', flag: 'ok' },
          { label: 'VAT (18%)', value: 'TZS 11,604,103', flag: 'ok' },
          { label: 'CPF (0.5%)', value: 'TZS 321,878', flag: 'ok' },
          { label: 'RDL (1.5%)', value: 'TZS 965,634', flag: 'ok' },
          { label: 'TOTAL TAXES DUE', value: 'TZS 22,136,845', flag: 'err' },
        ]},
      ],
      tables: [
        { title: 'Top 10 Items (of 201)', headers: ['#', 'Description', 'HS Code', 'Qty', 'Ass. Value TZS', 'Duty', 'VAT'], rows: [
          ['1', 'Jaw Plate Fixed',    '8474.90.00', '12 UN', '10,763,041', '1,614,456', '2,195,340'],
          ['2', 'Jaw Plate Swing',    '8474.90.00', '12 UN', '10,154,687', '1,523,203', '2,071,555'],
          ['3', 'Eccentric Shaft',    '8483.10.00', '4 UN',  '6,368,640',  '955,296',   '1,299,203'],
          ['4', 'Toggle Plate',       '8474.90.00', '8 UN',  '4,748,770',  '712,316',   '968,849'],
          ['5', 'Bearing Assembly',   '8482.10.10', '24 UN', '3,858,120',  '578,718',   '787,457'],
          ['6', 'Spring Assembly',    '8484.10.00', '16 UN', '3,088,896',  '463,334',   '630,000'],
          ['7', 'Side Liner',         '8474.90.00', '20 UN', '2,574,080',  '386,112',   '525,113'],
          ['8', 'Cheek Plate',        '8474.90.00', '20 UN', '2,316,672',  '347,501',   '472,601'],
          ['9', 'Flywheel',           '8483.50.00', '4 UN',  '2,059,264',  '308,890',   '420,090'],
          ['10','Drive Belt Set',     '4010.33.00', '12 SET','1,801,856',  '270,278',   '367,579'],
        ], totalRow: ['201 items', '', '', '', '64,375,579', '9,245,230+', '22,136,845'] },
      ],
      summary: '101-page TRA assessment. Customs value uplifted 2×. Total taxes: TZS 22.1M on assessed CIF of TZS 64.4M.',
    },
  },
  { id: 'd4', name: 'ReleaseOrder_TZDL261095360.pdf', type: 'release_order', uploadedAt: new Date('2026-02-15T14:00:00'), uploadedBy: 'Baraka Osei', size: '88 KB', extracted: { status: 'done', docType: 'TRA Release Order', confidence: 99, sections: [{ title: 'Release Info', fields: [{ label: 'TANSAD', value: 'TZDL261095360', flag: 'ok' }, { label: 'Release Date', value: '15/02/2026' }, { label: 'Channel', value: 'Green Channel ✓', flag: 'ok' }] }], summary: 'Release order issued — Green Channel. No physical inspection required.' } },
  { id: 'd5', name: 'COSCO_DeliveryOrder.pdf', type: 'delivery_order', uploadedAt: new Date('2026-02-15T11:00:00'), uploadedBy: 'Baraka Osei', size: '120 KB', extracted: { status: 'pending' } },
  { id: 'd6', name: 'SilverICD_Invoice_26-4421.pdf', type: 'icd_invoice', uploadedAt: new Date('2026-02-16T09:00:00'), uploadedBy: 'Baraka Osei', size: '95 KB', extracted: { status: 'processing' } },
];

const MOCK_LEDGER_1: LedgerEntry[] = [
  { id: 'l1',  description: 'Clearing Agency Fee',          amount: 1680600,  currency: 'TZS', type: 'charge',  date: new Date('2026-02-15'), status: 'paid',    reference: 'INV-2026-ALK-001' },
  { id: 'l2',  description: 'Import Duty (IMP)',             amount: 9245230,  currency: 'TZS', type: 'charge',  date: new Date('2026-02-14'), status: 'paid',    reference: 'TZDL261095360' },
  { id: 'l3',  description: 'VAT (18%)',                     amount: 11604103, currency: 'TZS', type: 'charge',  date: new Date('2026-02-14'), status: 'paid',    reference: 'TZDL261095360' },
  { id: 'l4',  description: 'CPF (0.5%)',                    amount: 321878,   currency: 'TZS', type: 'charge',  date: new Date('2026-02-14'), status: 'paid',    reference: 'TZDL261095360' },
  { id: 'l5',  description: 'RDL (1.5%)',                    amount: 965634,   currency: 'TZS', type: 'charge',  date: new Date('2026-02-14'), status: 'paid',    reference: 'TZDL261095360' },
  { id: 'l6',  description: 'Shipping Line DO Charges',      amount: 250969,   currency: 'TZS', type: 'charge',  date: new Date('2026-02-15'), status: 'paid' },
  { id: 'l7',  description: 'ICD Storage & Handling (Silver)',amount: 1657310, currency: 'TZS', type: 'charge',  date: new Date('2026-02-16'), status: 'pending' },
  { id: 'l8',  description: 'Demurrage — CSNU2541982 (3d)', amount: 77000,    currency: 'TZS', type: 'charge',  date: new Date('2026-02-14'), status: 'paid' },
  { id: 'l9',  description: 'Transport to Client Warehouse', amount: 3200000,  currency: 'TZS', type: 'charge',  date: new Date('2026-02-17'), status: 'pending' },
  { id: 'l10', description: 'Client Advance Payment',        amount: 28000000, currency: 'TZS', type: 'payment', date: new Date('2026-02-11'), status: 'paid',    reference: 'CRDB-26-887234' },
];

const INITIAL_JOBS: ClearanceJob[] = [
  {
    id: 'CLR-2026-0001', title: 'Crusher Accessories & Spare Parts',
    customer: 'Timeline Company Limited', customerId: 'cust-001',
    mode: 'SEA FCL', origin: 'Nansha, China', destination: 'Dar es Salaam (Silver ICD)',
    bl: 'COSU6441534213', tansad: 'TZDL-26-1095360', vessel: 'Cape Flores',
    containers: ['CSNU2541982', 'COSU7812345'], weight: '23,535 KGS', invoiceValue: 'USD 23,553.59', currency: 'USD',
    stage: 'inspection_booking', flags: ['green_channel', 'demurrage'],
    assignees: ['Baraka Osei', 'Amina Rashid'], listeners: MOCK_LISTENERS_1,
    createdAt: new Date('2026-02-11'), dueDate: new Date('2026-02-20'),
    thread: MOCK_THREAD_1, timeline: MOCK_TIMELINE_1, ledger: MOCK_LEDGER_1, documents: MOCK_DOCS_1,
    tasks: MOCK_TASKS_1, timeEntries: MOCK_TIME_1, activity: MOCK_ACTIVITY_1, cloudLinks: MOCK_CLOUD_1,
  },
  {
    id: 'CLR-2026-0002', title: 'Generator Parts & Spare Components',
    customer: 'Dangote Industries Ltd', customerId: 'cust-002',
    mode: 'SEA FCL', origin: 'Port Klang, Malaysia', destination: 'Dar es Salaam Port',
    bl: 'MSKU9887214567', tansad: 'TZDA-26-1379800', vessel: 'MSC GINA',
    containers: ['MSCU8821001', 'MSCU8821002', 'MSCU8821003'], weight: '41,200 KGS', invoiceValue: 'USD 87,400.00', currency: 'USD',
    stage: 'transport_delivery', flags: ['green_channel', 'sla_breach'],
    assignees: ['Baraka Osei'],
    listeners: [
      { id: 'u1', name: 'Baraka Osei', role: 'Clearance Officer', type: 'internal', channel: ['internal', 'email'] },
      { id: 'c3', name: 'Kwame Asante', role: 'Supply Chain Director', type: 'customer', channel: ['whatsapp', 'email', 'teams'] },
    ],
    createdAt: new Date('2026-01-28'), dueDate: new Date('2026-02-10'),
    thread: [
      { id: 't1', userId: 'u1', userName: 'Baraka Osei', content: 'All stages cleared. Container now in transit to client warehouse. ETA: Feb 16th.', ts: new Date('2026-02-14T16:00:00'), channels: ['whatsapp', 'email', 'teams'], isInternal: false },
    ],
    timeline: [
      { id: 'e1', stage: 'docs_received', label: 'Docs Received', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-01-28T09:00:00') },
      { id: 'e2', stage: 'validation', label: 'Validation', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-01-29T10:00:00') },
      { id: 'e3', stage: 'entry_preparation', label: 'Entry Prep', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-01-30T09:00:00') },
      { id: 'e4', stage: 'tancis_registration', label: 'TANCIS Reg', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-01-30T14:00:00') },
      { id: 'e5', stage: 'assessment_payment', label: 'Assessment', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-03T08:00:00') },
      { id: 'e6', stage: 'tax_payment', label: 'Tax Payment', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-05T11:00:00') },
      { id: 'e7', stage: 'do_application', label: 'DO Application', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-07T09:00:00') },
      { id: 'e8', stage: 'inspection_booking', label: 'Inspection Booking', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-10T10:00:00') },
      { id: 'e9', stage: 'transport_delivery', label: 'Transport & Delivery', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-14T16:00:00'), note: 'Truck dispatched. 3 containers on 2 trucks.' },
    ],
    ledger: [
      { id: 'l1', description: 'Clearing Agency Fee', amount: 4200000, currency: 'TZS', type: 'charge', date: new Date('2026-02-10'), status: 'paid' },
      { id: 'l2', description: 'Customs Duties & VAT', amount: 54800000, currency: 'TZS', type: 'charge', date: new Date('2026-02-05'), status: 'paid' },
      { id: 'l3', description: 'ICD & Port Charges', amount: 4100000, currency: 'TZS', type: 'charge', date: new Date('2026-02-08'), status: 'paid' },
      { id: 'l4', description: 'Transport', amount: 6800000, currency: 'TZS', type: 'charge', date: new Date('2026-02-14'), status: 'pending' },
      { id: 'l5', description: 'Client Payment', amount: 75000000, currency: 'TZS', type: 'payment', date: new Date('2026-02-01'), status: 'paid' },
    ],
    documents: [
      { id: 'd1', name: 'MSKU9887214567_BL.pdf', type: 'bl', uploadedAt: new Date('2026-01-28'), uploadedBy: 'Kwame Asante', size: '380 KB', extracted: { status: 'done', docType: 'Bill of Lading', confidence: 98, sections: [{ title: 'B/L Info', fields: [{ label: 'B/L Number', value: 'MSKU9887214567', flag: 'ok' }, { label: 'Vessel', value: 'MSC GINA' }] }], summary: 'B/L for 3 containers of Generator Parts from Port Klang.' } },
      { id: 'd2', name: 'TRA_Assessment_TZDA261379800.pdf', type: 'assessment', uploadedAt: new Date('2026-02-03'), uploadedBy: 'Baraka Osei', size: '2.8 MB', extracted: { status: 'done', docType: 'TRA Assessment', confidence: 91, sections: [], summary: 'Assessment for TZDA-26-1379800. Total taxes: TZS 54.2M.' } },
    ],
    tasks: [], timeEntries: [], activity: [], cloudLinks: [],
  },
  {
    id: 'CLR-2026-0003', title: 'Medical Equipment & Consumables',
    customer: 'Muhimbili National Hospital', customerId: 'cust-003',
    mode: 'AIR', origin: 'Frankfurt, Germany', destination: 'Julius Nyerere Int\'l Airport',
    bl: 'ET-721-8891234', stage: 'assessment_payment', flags: ['priority'],
    assignees: ['Amina Rashid'],
    listeners: [
      { id: 'u2', name: 'Amina Rashid', role: 'Senior Manager', type: 'internal', channel: ['internal', 'email'] },
      { id: 'c4', name: 'Dr. Fatuma Said', role: 'Procurement', type: 'customer', channel: ['email', 'sms'] },
    ],
    createdAt: new Date('2026-02-05'), dueDate: new Date('2026-02-15'),
    thread: [{ id: 't1', userId: 'u2', userName: 'Amina Rashid', content: 'AWB confirmed. Consignment on ground at JNIA Cargo. Awaiting TRA assessment.', ts: new Date('2026-02-09T10:00:00'), channels: ['internal', 'email'], isInternal: false }],

    timeline: [
      { id: 'e1', stage: 'docs_received', label: 'Docs Received', userId: 'u2', userName: 'Amina Rashid', ts: new Date('2026-02-05T14:00:00') },
      { id: 'e2', stage: 'validation', label: 'Validation', userId: 'u2', userName: 'Amina Rashid', ts: new Date('2026-02-06T09:00:00') },
      { id: 'e3', stage: 'entry_preparation', label: 'Entry Prep', userId: 'u2', userName: 'Amina Rashid', ts: new Date('2026-02-07T10:00:00') },
      { id: 'e4', stage: 'tancis_registration', label: 'TANCIS Reg', userId: 'u2', userName: 'Amina Rashid', ts: new Date('2026-02-08T11:00:00'), note: 'PHARMACY BOARD permit obtained.' },
      { id: 'e5', stage: 'assessment_payment', label: 'Assessment', userId: 'u2', userName: 'Amina Rashid', ts: new Date('2026-02-09T09:00:00'), blocker: 'TRA exemption application submitted — awaiting approval.' },
    ],
    ledger: [],
    documents: [{ id: 'd1', name: 'AWB_ET7218891234.pdf', type: 'bl', uploadedAt: new Date('2026-02-05'), uploadedBy: 'Dr. Fatuma Said', size: '210 KB', extracted: { status: 'done', docType: 'Air Waybill', confidence: 96, sections: [{ title: 'AWB Info', fields: [{ label: 'AWB', value: 'ET-721-8891234', flag: 'ok' }, { label: 'Origin', value: 'FRA (Frankfurt)' }, { label: 'Destination', value: 'DAR (Dar es Salaam)' }] }], summary: 'Air Waybill for Medical Equipment on Ethiopian Airlines.' } }],
    tasks: [], timeEntries: [], activity: [], cloudLinks: [],
  },
  {
    id: 'CLR-2026-0004', title: 'Construction Materials — Cement & Steel',
    customer: 'TTCL Tanzania', customerId: 'cust-004',
    mode: 'SEA LCL', origin: 'Mumbai, India', destination: 'Dar es Salaam Port',
    stage: 'tancis_registration', flags: ['on_hold'],
    assignees: ['Baraka Osei'],
    listeners: [
      { id: 'u1', name: 'Baraka Osei', role: 'Clearance Officer', type: 'internal', channel: ['internal'] },
      { id: 'c5', name: 'Moses Temba', role: 'Procurement', type: 'customer', channel: ['whatsapp'] },
    ],
    createdAt: new Date('2026-02-18'),
    thread: [{ id: 't1', userId: 'u1', userName: 'Baraka Osei', content: 'ON HOLD — HS code query raised by TRA for steel reinforcement bars. Awaiting client technical specs.', ts: new Date('2026-02-20T11:00:00'), channels: ['internal'], isInternal: true }],
    timeline: [
      { id: 'e1', stage: 'docs_received', label: 'Docs Received', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-18T09:00:00') },
      { id: 'e2', stage: 'validation', label: 'Validation', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-19T10:00:00'), note: 'Minor variation in weights noted.' },
      { id: 'e3', stage: 'entry_preparation', label: 'Entry Prep', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-20T09:00:00') },
      { id: 'e4', stage: 'tancis_registration', label: 'TANCIS Reg', userId: 'u1', userName: 'Baraka Osei', ts: new Date('2026-02-20T11:00:00'), blocker: 'HS code dispute — TRA queries steel classification. Client technical spec sheet required.' },
    ],
    ledger: [], documents: [], tasks: [], timeEntries: [], activity: [], cloudLinks: [],
  },
];

// ─── Reactive Store ───────────────────────────────────────────────────────────

let _jobs: ClearanceJob[] = INITIAL_JOBS.map(j => ({ ...j }));
const _subs = new Set<() => void>();

function notify() { _subs.forEach(fn => fn()); }

export function getJobs(): ClearanceJob[] { return _jobs; }
export function getJob(id: string): ClearanceJob | undefined { return _jobs.find(j => j.id === id); }

export function updateJob(id: string, updater: (j: ClearanceJob) => ClearanceJob): void {
  _jobs = _jobs.map(j => j.id === id ? updater(j) : j);
  notify();
}

export function addJob(job: ClearanceJob): void {
  _jobs = [job, ..._jobs];
  notify();
}

export function subscribe(fn: () => void): () => void {
  _subs.add(fn);
  return () => _subs.delete(fn);
}
