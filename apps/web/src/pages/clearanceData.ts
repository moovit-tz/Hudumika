import { apiFetch } from '../lib/api.js';
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
  status?: string;    // raw backend status: REQUIRED | RECEIVED | VERIFIED | REJECTED
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
  assignedToId?: string;   // raw user id of the assignee — for "assignee or their lead can close"
  closedAt?: Date;         // set when the task has been signed off / closed
  closedById?: string;     // who closed it
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
  // The shipment's governing workflow, resolved by the API. For a custom
  // workflow these are its real steps (own ids + names); the fixed `stage`
  // above is only a best-effort collapse and must NOT drive the stepper or
  // stage-advance for a custom case — use these instead (see jobUiSteps).
  workflowKind?: 'CUSTOM' | 'LEGACY';
  workflowName?: string;
  workflowSteps?: WfStep[];
  currentStepId?: string;
  // Daily shipment-report automation (migration 258) — tri-state: null
  // inherits the customer's own setting. See shipment-report.service.ts.
  dailyReportEnabled?: boolean | null;
  // True when at least one dangerous-goods declaration (dg_declarations) is
  // linked to this shipment — see ShipmentService.getById/listGroupedByCustomer.
  hasDangerousGoods?: boolean;
}

export interface WfStep {
  id: string;
  name: string;
  order: number;
  isTerminal: boolean;
  nextStepIds: string[];
  // Entry conditions evaluated for THIS shipment — what must be true to enter
  // the step, and whether it currently is. Lets the UI show the blockers.
  // `field` is the raw condition key: a `document:<TYPE>` field is what makes
  // the Documents checklist workflow-driven (its required docs come from here).
  requirements?: { label: string; passed: boolean; field?: string }[];
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

// ─── Workflow-aware stage helpers ────────────────────────────────────────────
// A shipment on a tenant-defined custom workflow has its own steps (ids +
// names) that the fixed legacy `STAGES` list knows nothing about. These helpers
// return the right steps to render and the right id to send, for both a custom
// workflow and the legacy ladder, so the stepper and Advance-Stage flow follow
// whichever workflow actually governs the case.

export interface UiStep { id: string; label: string; short: string; color: string; isTerminal: boolean; nextStepIds: string[] | null; }

const CUSTOM_STEP_PALETTE = ['#7c3aed', '#ea580c', '#d97706', '#2563eb', '#0891b2', '#059669', '#dc2626', '#6366f1', '#0d9488', '#db2777'];

type JobStageView = Pick<ClearanceJob, 'workflowKind' | 'workflowSteps' | 'currentStepId' | 'stage'>;

/** Ordered steps for a job's stepper/advance UI: its own custom workflow when
 *  it has one, else the fixed legacy stage ladder. */
export function jobUiSteps(job: JobStageView): UiStep[] {
  if (job.workflowKind === 'CUSTOM' && job.workflowSteps && job.workflowSteps.length > 0) {
    return [...job.workflowSteps].sort((a, b) => a.order - b.order).map((s, i) => ({
      id: s.id,
      label: s.name,
      short: s.name.length > 12 ? s.name.split(/\s+/)[0] : s.name,
      color: CUSTOM_STEP_PALETTE[i % CUSTOM_STEP_PALETTE.length],
      isTerminal: s.isTerminal,
      nextStepIds: s.nextStepIds,
    }));
  }
  return STAGES.map((s, i) => ({ id: s.id, label: s.label, short: s.short, color: s.color, isTerminal: i === STAGES.length - 1, nextStepIds: null }));
}

/** Index of the job's current step within jobUiSteps(job); -1 if unknown. */
export function jobCurrentIdx(job: JobStageView): number {
  const steps = jobUiSteps(job);
  const target = job.workflowKind === 'CUSTOM' ? job.currentStepId : job.stage;
  return steps.findIndex(s => s.id === target);
}

/** Human label of the job's current step. */
export function jobStageLabel(job: JobStageView): string {
  const steps = jobUiSteps(job);
  const idx = jobCurrentIdx(job);
  return steps[idx]?.label ?? (STAGES.find(s => s.id === job.stage)?.label || job.stage);
}

/** The stage id to send to the /stage endpoint for a chosen UI step. A custom
 *  workflow takes the raw step id; the legacy ladder maps to its backend key. */
export function jobBackendStage(job: Pick<ClearanceJob, 'workflowKind'>, targetId: string): string {
  if (job.workflowKind === 'CUSTOM') return targetId;
  return STAGE_API_MAP[targetId as Stage] ?? targetId.toUpperCase();
}

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

// ─── API → ClearanceJob adapter ──────────────────────────────────────────────

export function toStage(s: string): Stage {
  if (!s) return 'docs_received';
  // Try exact API key match first (e.g. 'PERMITS' → 'permit_applications')
  if (API_STAGE_MAP[s]) return API_STAGE_MAP[s];
  // Fallback: lowercase match for local IDs
  const n = s.toLowerCase().replace(/[\s-]+/g, '_') as Stage;
  return STAGES.find(x => x.id === n) ? n : 'docs_received';
}

// The frontend's TransportMode union predates RAIL/BULK (see CommandCenter.tsx,
// CreateShipmentPage.tsx) so those two normalize to the closest represented
// mode rather than widening the type here — same fallback shape as before for
// a row with no real type at all.
function normalizeMode(raw: string | undefined | null): TransportMode {
  const t = (raw || '').toUpperCase();
  if (t.includes('AIR')) return 'AIR';
  if (t.includes('ROAD') || t.includes('RAIL')) return 'ROAD';
  if (t.includes('LCL')) return 'SEA LCL';
  return 'SEA FCL';
}

export function apiToJob(data: any): ClearanceJob {
  return {
    id: String(data.id),
    title: data.goods_desc || data.ref_number || 'Shipment',
    sysRef: data.ref_number,
    customer: data.customer_name || 'Unknown',
    customerId: String(data.customer_id || ''),
    // Was hardcoded 'SEA FCL' for every shipment regardless of its real type —
    // harmless for display (nothing branched on it) until VesselLiveStatus
    // needed a real signal for "is this shipment sea-going" to gate an AIS
    // lookup.
    mode: normalizeMode(data.type || data.consignment_type),
    origin: data.port_of_loading || '—',
    destination: data.port_of_discharge || 'Dar es Salaam',
    bl: data.bl_number,
    tansad: data.tansad_number,
    // API returns this field as `vessel` (the shipment_cases column, spread
    // as-is by GET /v1/shipments/:id) — reading `vessel_name` here always
    // read undefined, so every shipment showed a blank Vessel field
    // regardless of what was actually on file.
    vessel: data.vessel,
    containers: data.container_numbers || [],
    weight: data.gross_weight_kg ? `${Number(data.gross_weight_kg).toLocaleString()} KG` : undefined,
    invoiceValue: data.cif_value_usd ? `USD ${Number(data.cif_value_usd).toLocaleString()}` : undefined,
    stage: toStage(data.stage || ''),
    workflowId: data.workflow_id ?? null,
    workflowKind: data.workflow?.kind,
    workflowName: data.workflow?.name,
    workflowSteps: data.workflow?.steps,
    currentStepId: data.workflow?.currentStepId,
    isDone: Boolean(data.resolved_at),
    flags: ((data.active_risk_types || []) as string[]).map(r => r.toLowerCase()) as Flag[],
    assignees: data.assigned_to ? [data.assigned_to] : [],
    listeners: (data.listeners || []).map((l: any) => ({
      id: l.user_id || l.id, listenerId: l.id, name: l.name, role: l.role || '',
      type: l.type as 'internal' | 'customer',
      channel: (l.channels || []) as Channel[],
    })),
    createdAt: new Date(data.created_at || Date.now()),
    dueDate: data.due_date ? new Date(data.due_date) : undefined,
    thread: (data.messages || []).map((m: any, i: number) => ({
      id: m.id || `msg-${i}`, userId: String(m.author_id || 'system'), userName: m.author_name || 'System',
      content: m.content, ts: new Date(m.created_at || Date.now()),
      channels: [(m.channel?.toLowerCase() || 'internal') as Channel],
      isInternal: !m.channel || m.channel === 'INTERNAL',
    })),
    timeline: (data.stage_history || []).map((h: any, i: number) => ({
      id: h.id || `ev-${i}`, stage: toStage(h.stage || ''),
      label: STAGES.find(s => s.id === toStage(h.stage || ''))?.label || h.stage,
      userId: h.user_id || 'system', userName: h.user_name || 'System',
      ts: new Date(h.entered_at || Date.now()), note: h.note, blocker: h.blocker,
    })),
    ledger: [
      ...(data.expenses || []).filter((e: any) => !e.is_revenue).map((e: any) => ({
        id: e.id || `exp-${e.label}`, description: e.label, amount: Number(e.amount_tzs),
        currency: 'TZS', type: 'charge' as const, date: new Date(e.created_at || Date.now()), status: 'pending' as const,
      })),
      ...(data.expenses || []).filter((e: any) => e.is_revenue).map((e: any) => ({
        id: `pay-${e.id}`, description: e.label, amount: Number(e.amount_tzs),
        currency: 'TZS', type: 'payment' as const, date: new Date(e.created_at || Date.now()), status: 'paid' as const,
      })),
    ],
    documents: (data.documents || []).map((d: any) => ({
      id: String(d.id), name: d.filename || d.type, type: (d.type?.toLowerCase() || 'other') as DocType,
      // The server now joins users for this. Falls back to the id only when
      // there is genuinely no account behind it (an import, or a deleted user),
      // rather than printing a uuid at everyone.
      size: '—', uploadedBy: d.uploaded_by_name || (d.uploaded_by ? 'A former colleague' : 'System'),
      uploadedAt: new Date(d.created_at || Date.now()), extracted: { status: 'pending' as const },
      apiType: d.type, pending: !d.storage_key, status: d.status,
    })),
    tasks: [], timeEntries: [], cloudLinks: [],
    /**
     * The Overview's Activity Feed. This was hardcoded `[]`, and nothing else
     * ever assigned to it — so the panel could not have shown anything in any
     * tenant, however much had happened to the shipment.
     *
     * Built from what the server actually reports: stage movements, and
     * documents as they arrived. Not invented, and deliberately not padded with
     * events the API does not send — an empty feed on a genuinely quiet
     * shipment is the right answer.
     */
    activity: [
      ...(data.stage_history || []).map((h: any, i: number): ActivityEvent => ({
        id: `act-stage-${h.id || i}`,
        userId: h.user_id || 'system',
        userName: h.user_name || 'System',
        action: 'stage_change',
        subject: `moved this to ${STAGES.find(st => st.id === toStage(h.stage || ''))?.label || h.stage}`,
        detail: h.note || h.blocker || undefined,
        ts: new Date(h.entered_at || Date.now()),
      })),
      ...(data.documents || []).filter((d: any) => d.storage_key).map((d: any, i: number): ActivityEvent => ({
        id: `act-doc-${d.id || i}`,
        userId: d.uploaded_by || 'system',
        userName: d.uploaded_by_name || (d.uploaded_by ? 'A former colleague' : 'System'),
        action: 'uploaded',
        subject: `uploaded ${d.filename || d.type}`,
        ts: new Date(d.created_at || Date.now()),
      })),
    ].sort((a, b) => a.ts.getTime() - b.ts.getTime()),
    co2EmissionsKg: data.co2_emissions_kg ? Number(data.co2_emissions_kg) : undefined,
    carbonCreditsSaved: data.carbon_credits_saved ? Number(data.carbon_credits_saved) : undefined,
    co2CalcDetails: typeof data.co2_calc_details === 'string' ? JSON.parse(data.co2_calc_details) : data.co2_calc_details,
    customerContactName: data.customer_contact_name || undefined,
    customerEmail: data.customer_email || undefined,
    customerPhone: data.customer_phone || undefined,
    assigneeName: data.assigned_officer_name || undefined,
    assigneeEmail: data.assigned_officer_email || undefined,
    assigneePhone: data.assigned_officer_phone || undefined,
    whatsappBotActive: data.whatsapp_bot_active !== false,
    dailyReportEnabled: data.daily_report_enabled ?? null,
    hasDangerousGoods: !!data.has_dangerous_goods,
  };
}

// ─── Reactive Store ───────────────────────────────────────────────────────────

/**
 * Backed by GET /v1/shipments, not by a literal.
 *
 * `_jobs` used to be seeded from an INITIAL_JOBS array and mutated in memory:
 * every edit was lost on reload, nothing was tenant-scoped, and the 51
 * endpoints in shipments.routes.ts went unused — while ShipmentBoard,
 * ShipmentDetail, DeliveryNotes and TopBar all read from it.
 *
 * The load is lazy and shared: the first subscriber triggers it, later ones
 * reuse the same in-flight promise, so four consumers mounting together make
 * one request. Tenant scoping is the API's job — /v1/shipments filters on
 * tenant_id explicitly (see shipments.routes.ts), which an in-memory array
 * could not do at all.
 */
let _jobs: ClearanceJob[] = [];
const _subs = new Set<() => void>();

let _loaded = false;
let _inflight: Promise<void> | null = null;

function notify() { _subs.forEach(fn => fn()); }

export function loadJobs(force = false): Promise<void> {
  if (_inflight) return _inflight;
  if (_loaded && !force) return Promise.resolve();
  _inflight = apiFetch('/v1/shipments')
    .then((rows: any) => {
      _jobs = (Array.isArray(rows) ? rows : rows?.data ?? []).map(apiToJob);
      _loaded = true;
      notify();
    })
    .catch(() => { /* leave the list empty rather than show invented rows */ })
    .finally(() => { _inflight = null; });
  return _inflight;
}

// Any read primes the load, not just subscribe(): several consumers call
// getJobs() once in a useState initialiser and never subscribe, so keying the
// fetch off subscription alone left them looking at an empty list forever.
export function getJobs(): ClearanceJob[] { void loadJobs(); return _jobs; }
export function getJob(id: string): ClearanceJob | undefined { void loadJobs(); return _jobs.find(j => j.id === id); }

/** Optimistic, with rollback — the same shape data/productData.ts uses. */
export function updateJob(id: string, updater: (j: ClearanceJob) => ClearanceJob): void {
  const prev = _jobs;
  const next = _jobs.find(j => j.id === id);
  _jobs = _jobs.map(j => j.id === id ? updater(j) : j);
  notify();
  if (!next) return;
  const updated = _jobs.find(j => j.id === id)!;
  const body: Record<string, unknown> = {};
  if (updated.stage !== next.stage) body.stage = STAGE_API_MAP[updated.stage] ?? updated.stage;
  if (updated.bl !== next.bl) body.bl_number = updated.bl;
  if (updated.tansad !== next.tansad) body.tansad_number = updated.tansad;
  if (!Object.keys(body).length) return;
  apiFetch(`/v1/shipments/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    .catch(() => { _jobs = prev; notify(); });
}

export function addJob(job: ClearanceJob): void {
  _jobs = [job, ..._jobs];
  notify();
}

export function subscribe(fn: () => void): () => void {
  _subs.add(fn);
  void loadJobs();
  return () => _subs.delete(fn);
}
