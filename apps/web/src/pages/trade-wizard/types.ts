export type ProcedureKind = 'IMPORT' | 'EXPORT' | 'TRANSIT' | 'REGISTRATION';

export interface ProcedureSummary {
  id: string;
  source_id: number | null;
  name: string;
  kind: ProcedureKind;
  product_keywords: string | null;
  summary: string | null;
  has_detail: boolean;
  source_url: string | null;
}

export interface PrecheckOption { value: string; label: string }
export interface Precheck { id: string; question: string; help_text: string | null; options: PrecheckOption[] }

export interface Institution {
  id: string | null;
  name: string | null;
  acronym: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}

export interface ProcedureStep {
  id: string;
  step_no: number;
  name: string;
  description: string | null;
  duration_estimate: string | null;
  cost_estimate: string | null;
  required_documents: string[];
  is_online: boolean;
  source_url: string | null;
  institution_name: string | null;
  institution_acronym: string | null;
  institution_phone: string | null;
  institution_email: string | null;
  institution_website: string | null;
  institution_address: string | null;
}

export interface ProcedureDetail extends ProcedureSummary {
  steps: ProcedureStep[];
  prechecks: Precheck[];
}

export interface RecommendedAgent { id: string; name: string; email: string | null; tel: string | null; region: string | null; license_no: string | null }

export interface WizardResult {
  procedure: { id: string; name: string; kind: ProcedureKind; summary: string | null; source_url: string | null; has_detail: boolean };
  steps: ProcedureStep[];
  documents_needed: string[];
  offices: Institution[];
  recommended_agents: RecommendedAgent[];
  usage: { used: number; limit: number | null };
}

export interface WizardDraft {
  kind: ProcedureKind | null;
  procedure: ProcedureDetail | null;
  answers: Record<string, string>;
  result: WizardResult | null;
}

export const EMPTY_DRAFT: WizardDraft = { kind: null, procedure: null, answers: {}, result: null };

export interface StepProps {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}
