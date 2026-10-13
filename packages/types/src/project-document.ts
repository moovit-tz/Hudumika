export interface ProjectDocumentSource {
  id: string;
  name: string;
  sha256: string;
  warnings: string[];
}

export interface ProjectDocumentBrief {
  name: string;
  description: string;
  industry: string;
  project_type: 'capital_expenditure' | 'customer_delivery' | 'internal' | 'r_and_d' | 'maintenance';
  currency: string | null;
  baseline_budget: number | null;
  contract_value: number | null;
  start_date: string | null;
  target_date: string | null;
  location_address: string | null;
  client_name: string | null;
  tender_reference: string | null;
  submission_deadline: string | null;
  submission_instructions: string | null;
  scope: string[];
  deliverables: string[];
  requirements: string[];
  risks: string[];
  missing_information: string[];
  tags: string[];
  source_ids: string[];
  sources?: ProjectDocumentSource[];
  evidence: { file_id: string; locator: string; quote: string }[];
}

export interface ProjectDocumentAnalysis {
  candidates: ProjectDocumentBrief[];
  sources: ProjectDocumentSource[];
  warnings: string[];
}
