import { Badge } from '../../components/ui/badge.js';
import type { PulseSource } from './pulseFields.js';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';
export type Channel = 'email' | 'sms' | 'whatsapp';

export interface SegmentStats { total: number; with_email: number; with_phone: number; email_suppressed: number }
export interface Rule { field: string; op: string; value?: unknown }
export interface Segment {
  id: string; name: string; description: string | null; source: PulseSource; match_type: 'all' | 'any';
  rules: Rule[]; stats: SegmentStats | null; updated_at: string;
}
export interface Member { id: string; name: string; email: string | null; phone: string | null; avatar_url: string | null; kind: 'person' | 'company' }

export interface AbTest {
  variants: { key: string; subject: string }[];
  sample_pct: number; metric: 'open' | 'click'; decide_after_hours: number;
  winner_key?: string; decided_at?: string;
}

export interface Campaign {
  id: string; name: string; channel: Channel; status: CampaignStatus; segment_id: string | null;
  subject: string | null; preheader: string | null; from_name: string | null; reply_to: string | null;
  body_html: string | null; body_text: string | null; ab_test: AbTest | null; utm_campaign: string | null;
  whatsapp_template: { name: string; language: string; params: string[] } | null;
  scheduled_at: string | null; started_at: string | null; sent_at: string | null; total_recipients: number;
  last_error: string | null; created_at: string; updated_at: string;
  journey_id?: string | null;
}

const STATUS: Record<CampaignStatus, { label: string; variant: 'gray' | 'info' | 'warning' | 'success' | 'error' }> = {
  draft: { label: 'Draft', variant: 'gray' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  sending: { label: 'Sending', variant: 'warning' },
  sent: { label: 'Sent', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'gray' },
  failed: { label: 'Failed', variant: 'error' },
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  const s = STATUS[status] ?? STATUS.draft;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export const CHANNEL_LABEL: Record<Channel, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };
export const CHANNEL_ICON = { email: 'mail', sms: 'messageSquare', whatsapp: 'messageSquare' } as const;

/** "42%" of a base; "—" when nothing has been sent yet, so 0/0 never reads as 0%. */
export function pct(n: number, of: number) {
  if (!of) return '—';
  const v = (n / of) * 100;
  return `${v >= 10 || v === 0 ? Math.round(v) : v.toFixed(1)}%`;
}

export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString();

export function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function apiError(e: unknown) {
  const m = (e as any)?.message || (e as any)?.error;
  return typeof m === 'string' && m ? m : 'Something went wrong. Try again.';
}
