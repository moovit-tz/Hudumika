// ─── Hudumika eSign — shared TypeScript interfaces ──────────────────────────
// These are the canonical shapes for envelopes, recipients, fields,
// audit events, and templates. Both apps/api and apps/web import from here.

export type SignEnvelopeStatus = 'draft' | 'sent' | 'completed' | 'voided' | 'declined' | 'expired';
export type SignRecipientStatus = 'pending' | 'viewed' | 'signed' | 'declined';
export type SignFieldType = 'signature' | 'initials' | 'date' | 'text' | 'checkbox' | 'stamp' | 'certification_stamp';
export type SignOrderMode = 'sequential' | 'parallel';
export type SignEventType =
  | 'created' | 'updated' | 'sent' | 'reminded' | 'viewed'
  | 'signed' | 'declined' | 'completed' | 'voided' | 'expired'
  | 'stamped' | 'verified' | 'amended';

export interface SignRecipient {
  id: string;
  envelope_id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone: string | null;
  // Set when this recipient was tagged to a real internal platform user
  // (via EntityPicker in SignEditor) rather than typed in as a freeform
  // external signer — enables an in-app bell notification alongside
  // email/SMS/WhatsApp, since there's a real user_id to notify.
  user_id: string | null;
  role_label: string | null;
  sign_order: number;
  status: SignRecipientStatus;
  token: string;
  signature_data: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  viewed_at: string | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  // Certified True Copy (migration 342) — real facts about this recipient
  // as a licensed advocate/notary/commissioner, not the tenant's own stamp.
  is_certifier: boolean;
  certifier_title: string | null;
  certifier_roll_number: string | null;
  certifier_firm: string | null;
  created_at: string;
}

export interface SignField {
  id: string;
  envelope_id: string;
  recipient_id: string;
  field_type: SignFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  placeholder: string | null;
  value: string | null;
  created_at: string;
}

export interface SignEvent {
  id: string;
  envelope_id: string;
  recipient_id: string | null;
  event_type: SignEventType;
  actor_name: string | null;
  actor_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  note: string | null;
  created_at: string;
}

export interface SignEnvelope {
  id: string;
  tenant_id: string;
  created_by: string;
  title: string;
  message: string | null;
  file_id: string | null;
  file_name: string | null;
  document_data: string | null;
  status: SignEnvelopeStatus;
  order_mode: SignOrderMode;
  template_id: string | null;
  require_otp: boolean;
  expires_at: string | null;
  sent_at: string | null;
  completed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  // DocuSign-style verification — format: HSGN-XXXXXX-XXXXXX
  verification_code: string | null;
  stamp_applied: boolean;
  stamped_at: string | null;
  stamped_file_url: string | null;
  // Real Bitcoin anchor via OpenTimestamps — see sign-pdf.service.ts /
  // opentimestamps.service.ts. null until the envelope completes.
  anchor_status: 'pending' | 'confirmed' | null;
  anchor_block_height: number | null;
  anchor_block_time: string | null;
  // Versioning (migration 342) — set when this envelope is an amendment of
  // an earlier completed one (POST /envelopes/:id/amend).
  previous_version_id: string | null;
  version_number: number;
  created_at: string;
  updated_at: string;
  // Joined on fetch
  recipients?: SignRecipient[];
  fields?: SignField[];
  events?: SignEvent[];
  // Joined on fetch (GET /envelopes/:id only) — the version chain, so the
  // detail page can show "superseded by Version 2" / "amends Version 1"
  // without a second round trip.
  previous_version?: { id: string; title: string; version_number: number } | null;
  next_version?: { id: string; title: string; version_number: number; status: string } | null;
}

export interface SignTemplateRecipientDef {
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  role_label: string | null;
  sign_order: number;
}

export interface SignTemplateFieldDef {
  recipient_index: number;   // index into recipients array above
  field_type: SignFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  placeholder: string | null;
}

export interface SignTemplate {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  description: string | null;
  fields: SignTemplateFieldDef[];
  recipients: SignTemplateRecipientDef[];
  file_id: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string;
}
