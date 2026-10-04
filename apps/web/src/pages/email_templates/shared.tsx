import React from 'react';
import type { EmailBlock } from '../../components/EmailBlockBuilder.js';

export const MY_MERGE_VARS = [
  { tag: 'first_name', label: 'First Name', sample: 'Sarah' },
  { tag: 'last_name', label: 'Last Name', sample: 'Massawe' },
  { tag: 'company', label: 'Company', sample: 'Kilimanjaro Logistics Ltd' },
  { tag: 'email', label: 'Email', sample: 'sarah.m@kilimanjaro.co.tz' },
  { tag: 'date', label: 'Date', sample: '28/09/2026' },
  { tag: 'invoice_no', label: 'Invoice #', sample: 'INV-2026-904' },
  { tag: 'amount', label: 'Amount', sample: 'TZS 3,450,000' },
  { tag: 'order_id', label: 'Order ID', sample: 'ORD-88219' },
  { tag: 'support_url', label: 'Support Link', sample: 'https://hudumika.com/help' },
  { tag: 'unsubscribe_url', label: 'Unsubscribe Link', sample: 'https://hudumika.com/unsub' },
];

export const DEFAULT_SAMPLE_DATA: Record<string, string> = {
  first_name: 'Sarah',
  last_name: 'Massawe',
  company: 'Kilimanjaro Logistics Ltd',
  email: 'sarah.m@kilimanjaro.co.tz',
  date: '28/09/2026',
  invoice_no: 'INV-2026-904',
  amount: 'TZS 3,450,000',
  order_id: 'ORD-88219',
  support_url: 'https://hudumika.com/help',
  unsubscribe_url: 'https://hudumika.com/unsub',
};

export const QUICK_TEMPLATE_CATEGORIES = [
  'General',
  'Transactional & Billing',
  'Support & Service',
  'Account & Staff',
  'Marketing & Sales',
  'Notifications',
] as const;

export interface MyTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  body_html: string | null;
  is_html: boolean;
  category: string;
  group_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ImportedMarketplaceTpl {
  id: string;
  title: string;
  category: string;
  subject: string;
  is_hudumika_official: boolean;
  local_template_key: string;
  imported_at?: string;
  source_version?: string;
}

export interface SysTpl {
  template_key: string;
  category: string;
  subject: string;
  body_html: string;
  preheader: string;
  body_plain: string;
  locale: string;
  status: string;
  is_customized: boolean;
  is_builtin: boolean;
  available_vars: string[];
  event_key: string | null;
  application: string | null;
  revision: number;
  block_document: { version: 1; blocks: Array<Record<string, unknown>> } | null;
}

export interface MktTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  application: string | null;
  author_name: string;
  is_hudumika_official: boolean;
  downloads: number;
  version: string;
  subject: string;
  preheader: string;
  body_html: string;
  body_plain: string;
}

export const MKT_CAT_LABEL: Record<string, string> = {
  finance: 'Finance',
  auth: 'Auth & Security',
  crm: 'CRM',
  hr: 'HR & Payroll',
  esign: 'eSign',
  support: 'Support',
  clearos: 'ClearOS',
  commerce: 'Commerce',
  general: 'General',
  projects: 'Projects',
  security: 'Security',
};

export function htmlToBuilderBlocks(html: string): EmailBlock[] {
  if (!html.trim() || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: EmailBlock[] = [];
  const id = () => Math.random().toString(36).slice(2);
  doc.body.querySelectorAll('h1,h2,h3,p,a[href],hr,img').forEach(element => {
    const text = element.textContent?.trim() ?? '';
    if (element.matches('h1,h2,h3') && text) {
      blocks.push({ id: id(), type: 'heading', text, level: Number(element.tagName.slice(1)) as 1 | 2 | 3, align: 'left' });
    } else if (element.matches('p') && !element.querySelector('a') && text) {
      blocks.push({ id: id(), type: 'paragraph', text });
    } else if (element.matches('a[href]') && text) {
      blocks.push({ id: id(), type: 'button', label: text, url: element.getAttribute('href') ?? '#', align: 'center', color: '#0d9488' });
    } else if (element.matches('hr')) {
      blocks.push({ id: id(), type: 'divider' });
    } else if (element instanceof HTMLImageElement) {
      blocks.push({ id: id(), type: 'image', src: element.src, alt: element.alt, width: element.getAttribute('width') ?? '100%', align: 'center' });
    }
  });
  if (!blocks.length) {
    const text = doc.body.textContent?.replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ id: id(), type: 'paragraph', text });
  }
  return blocks;
}

export function plainTextPreviewHtml(value: string): string {
  const escaped = (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,-apple-system,sans-serif;color:#1e293b;padding:28px 24px;line-height:1.6;font-size:14px;white-space:pre-wrap;background:#ffffff;margin:0;">${escaped}</body></html>`;
}

export function evaluateSampleMergeTags(templateText: string, sampleData: Record<string, string>): string {
  return templateText.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, tag) => {
    return sampleData[tag] ?? match;
  });
}

export function startColumnResize(
  e: React.PointerEvent,
  initialWidth: number,
  direction: 1 | -1,
  setWidth: React.Dispatch<React.SetStateAction<number>>,
  min: number,
  max: number,
) {
  const startX = e.clientX;
  e.preventDefault();
  document.body.classList.add('email-template-is-resizing');
  const onMove = (event: PointerEvent) => {
    setWidth(Math.max(min, Math.min(max, initialWidth + ((event.clientX - startX) * direction))));
  };
  const onUp = () => {
    document.body.classList.remove('email-template-is-resizing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
