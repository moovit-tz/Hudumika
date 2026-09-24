/**
 * EmailBlockBuilder — drag-and-drop block editor for email templates.
 *
 * Architecture:
 *   LEFT  — searchable, categorised block palette
 *   CENTER — rendered canvas (live block-by-block preview with desktop/mobile toggle)
 *   RIGHT  — selected block properties panel
 *
 * Emits email-safe HTML (inline styles, table-based layout where needed).
 * No external library dependencies.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Input } from './ui/input.js';
import { Textarea } from './ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
import { Tip } from './ui/tooltip.js';
import { apiFetch } from '../lib/api.js';
import './EmailBlockBuilder.css';

function readCssAccent(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--teal').trim();
  return v || '#1257c6';
}

// ── Block types ──────────────────────────────────────────────────────────────

export type EmailBlock =
  // Content
  | { id: string; type: 'heading'; text: string; level: 1 | 2 | 3; align: 'left' | 'center' | 'right'; color?: string }
  | { id: string; type: 'paragraph'; text: string; align?: 'left' | 'center' | 'right'; color?: string; fontSize?: number }
  | { id: string; type: 'quote'; text: string; author: string; role?: string }
  // Interactive
  | { id: string; type: 'button'; label: string; url: string; align: 'left' | 'center'; color: string; fullWidth?: boolean; borderRadius?: number }
  | { id: string; type: 'social'; links: { platform: string; url: string; label: string }[] }
  // Media
  | { id: string; type: 'image'; src: string; alt: string; width: string; align: 'left' | 'center'; link?: string; borderRadius?: string }
  | { id: string; type: 'logo'; src: string; alt: string; width: string; align: 'left' | 'center' | 'right' }
  // Layout
  | { id: string; type: 'banner'; title: string; subtitle?: string; bgColor: string; textColor: string }
  | { id: string; type: 'divider'; style?: 'solid' | 'dashed' | 'dotted'; color?: string; thickness?: number }
  | { id: string; type: 'spacer'; size: number }
  // Data
  | { id: string; type: 'keyvalue'; rows: { label: string; value: string }[] }
  // Compliance
  | { id: string; type: 'callout'; text: string; variant: 'info' | 'warning' | 'success' | 'error' }
  | { id: string; type: 'footer'; text: string; align?: 'left' | 'center' | 'right' }
  | { id: string; type: 'unsubscribe'; text: string };

type BlockType = EmailBlock['type'];
type BlockCategory = 'Content' | 'Interactive' | 'Media' | 'Layout' | 'Data' | 'Compliance';

const BLOCK_PALETTE: { type: BlockType; label: string; icon: string; description: string; category: BlockCategory }[] = [
  { type: 'heading',     label: 'Heading',     icon: 'type',              description: 'H1/H2/H3 title',             category: 'Content' },
  { type: 'paragraph',   label: 'Text',        icon: 'alignLeft',         description: 'Body paragraph',             category: 'Content' },
  { type: 'quote',       label: 'Quote',       icon: 'chatBubble',        description: 'Blockquote / testimonial',   category: 'Content' },
  { type: 'button',      label: 'Button',      icon: 'mousePointerClick', description: 'Call-to-action link button', category: 'Interactive' },
  { type: 'social',      label: 'Social',      icon: 'share',             description: 'Social media links row',     category: 'Interactive' },
  { type: 'image',       label: 'Image',       icon: 'image',             description: 'Image with alt text',        category: 'Media' },
  { type: 'logo',        label: 'Logo',        icon: 'circle',            description: 'Company logo block',         category: 'Media' },
  { type: 'banner',      label: 'Banner',      icon: 'layoutDashboard',   description: 'Full-width colour banner',   category: 'Layout' },
  { type: 'divider',     label: 'Divider',     icon: 'minus',             description: 'Horizontal rule',            category: 'Layout' },
  { type: 'spacer',      label: 'Spacer',      icon: 'arrowUpDown',       description: 'Vertical gap',               category: 'Layout' },
  { type: 'keyvalue',    label: 'Key–Value',   icon: 'table',             description: 'Label/value table rows',     category: 'Data' },
  { type: 'callout',     label: 'Callout',     icon: 'alertCircle',       description: 'Info / warning / tip box',   category: 'Compliance' },
  { type: 'footer',      label: 'Footer',      icon: 'text',              description: 'Footer disclaimer text',     category: 'Compliance' },
  { type: 'unsubscribe', label: 'Unsubscribe', icon: 'mail',              description: 'Compliance unsubscribe link', category: 'Compliance' },
];

const BLOCK_CATEGORIES: BlockCategory[] = ['Content', 'Interactive', 'Media', 'Layout', 'Data', 'Compliance'];

function newBlock(type: BlockType): EmailBlock {
  const id = Math.random().toString(36).slice(2);
  switch (type) {
    case 'heading':     return { id, type, text: 'Heading text', level: 2, align: 'left' };
    case 'paragraph':   return { id, type, text: 'Your paragraph text here.' };
    case 'quote':       return { id, type, text: 'An inspiring quote that resonates with your audience.', author: 'Jane Smith', role: 'CEO, Company Name' };
    case 'button':      return { id, type, label: 'Click here', url: '#', align: 'center', color: readCssAccent() };
    case 'social':      return { id, type, links: [{ platform: 'linkedin', url: '#', label: 'LinkedIn' }, { platform: 'twitter', url: '#', label: 'Twitter' }, { platform: 'facebook', url: '#', label: 'Facebook' }] };
    case 'image':       return { id, type, src: '', alt: '', width: '100%', align: 'center' };
    case 'logo':        return { id, type, src: '', alt: 'Company Logo', width: '160px', align: 'center' };
    case 'banner':      return { id, type, title: 'Your headline here', subtitle: 'Supporting text below the headline', bgColor: readCssAccent(), textColor: '#ffffff' };
    case 'divider':     return { id, type };
    case 'spacer':      return { id, type, size: 24 };
    case 'keyvalue':    return { id, type, rows: [{ label: 'Label', value: 'Value' }] };
    case 'callout':     return { id, type, text: 'Important note here.', variant: 'info' };
    case 'footer':      return { id, type, text: 'This is an automated message. Please do not reply.', align: 'center' };
    case 'unsubscribe': return { id, type, text: "You're receiving this email because you subscribed to our updates. <a href=\"{{unsubscribe_url}}\">Unsubscribe</a> · <a href=\"{{preferences_url}}\">Preferences</a>" };
  }
}

// ── HTML generation ──────────────────────────────────────────────────────────

const SOCIAL_COLORS: Record<string, string> = {
  linkedin: '#0a66c2', twitter: '#1da1f2', facebook: '#1877f2',
  instagram: '#e1306c', youtube: '#ff0000', tiktok: '#000000',
  github: '#333333', website: '#6b7280',
};

function blockToHtml(block: EmailBlock): string {
  switch (block.type) {
    case 'heading': {
      const sizes = { 1: '26px', 2: '20px', 3: '16px' };
      const weight = { 1: '800', 2: '700', 3: '600' };
      const color = block.color ?? '#111827';
      return `<h${block.level} style="margin:0 0 12px;font-size:${sizes[block.level]};font-weight:${weight[block.level]};color:${color};text-align:${block.align};line-height:1.3;">${block.text}</h${block.level}>`;
    }
    case 'paragraph': {
      const align = block.align ?? 'left';
      const color = block.color ?? '#374151';
      const size = block.fontSize ?? 14;
      return `<p style="margin:0 0 14px;font-size:${size}px;line-height:1.6;color:${color};text-align:${align};">${block.text.replace(/\n/g, '<br />')}</p>`;
    }
    case 'quote':
      return `<blockquote style="margin:16px 0;padding:12px 20px 12px 16px;border-left:3px solid #e5e7eb;background:#f9fafb;border-radius:0 4px 4px 0;"><p style="margin:0 0 8px;font-size:15px;font-style:italic;color:#374151;line-height:1.6;">${block.text}</p><cite style="font-size:12px;color:#6b7280;font-style:normal;font-weight:600;">— ${block.author}${block.role ? `, <span style="font-weight:400;">${block.role}</span>` : ''}</cite></blockquote>`;
    case 'button': {
      const wrap = block.align === 'center' ? 'text-align:center;' : '';
      const radius = block.borderRadius !== undefined ? block.borderRadius : 6;
      const width = block.fullWidth ? 'display:block;width:100%;' : 'display:inline-block;';
      return `<div style="margin:16px 0;${wrap}"><a href="${block.url}" style="background:${block.color};color:#ffffff;padding:11px 24px;text-decoration:none;border-radius:${radius}px;${width}font-size:14px;font-weight:600;text-align:center;">${block.label}</a></div>`;
    }
    case 'social': {
      const links = block.links.map(l => {
        const c = SOCIAL_COLORS[l.platform] ?? '#6b7280';
        return `<a href="${l.url}" style="display:inline-block;margin:0 6px;padding:6px 12px;background:${c};color:#ffffff;text-decoration:none;border-radius:4px;font-size:12px;font-weight:600;">${l.label}</a>`;
      }).join('');
      return `<div style="text-align:center;padding:12px 0;margin:8px 0;">${links}</div>`;
    }
    case 'image': {
      const w = block.width === '100%' ? '100%' : block.width;
      const radius = block.borderRadius ? `border-radius:${block.borderRadius};` : '';
      const imgStyle = `display:block;max-width:${w};height:auto;${radius}${block.align === 'center' ? 'margin:0 auto;' : ''}`;
      const img = block.src
        ? `<img src="${block.src}" alt="${block.alt}" style="${imgStyle}" />`
        : `<div style="background:#f3f4f6;border:2px dashed #d1d5db;height:80px;display:flex;align-items:center;justify-content:center;border-radius:4px;color:#9ca3af;font-size:13px;">[Image placeholder]</div>`;
      const wrapped = block.link ? `<a href="${block.link}" style="display:block;text-decoration:none;">${img}</a>` : img;
      return `<div style="margin:12px 0;">${wrapped}</div>`;
    }
    case 'logo': {
      const alignStyle = block.align === 'center' ? 'text-align:center;' : block.align === 'right' ? 'text-align:right;' : '';
      const imgStyle = `max-width:${block.width};height:auto;display:inline-block;`;
      return `<div style="margin:12px 0;${alignStyle}">${block.src ? `<img src="${block.src}" alt="${block.alt}" style="${imgStyle}" />` : `<div style="display:inline-block;background:#f3f4f6;border:2px dashed #d1d5db;height:48px;width:${block.width};line-height:48px;text-align:center;border-radius:4px;color:#9ca3af;font-size:12px;">[Logo]</div>`}</div>`;
    }
    case 'banner':
      return `<div style="background:${block.bgColor};padding:28px 32px;text-align:center;margin:0 0 16px;border-radius:6px;"><h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:${block.textColor};line-height:1.3;">${block.title}</h2>${block.subtitle ? `<p style="margin:0;font-size:14px;color:${block.textColor};opacity:0.85;line-height:1.5;">${block.subtitle}</p>` : ''}</div>`;
    case 'divider': {
      const style = block.style ?? 'solid';
      const color = block.color ?? '#e5e7eb';
      const thickness = block.thickness ?? 1;
      return `<hr style="border:none;border-top:${thickness}px ${style} ${color};margin:20px 0;" />`;
    }
    case 'spacer':
      return `<div style="height:${block.size}px;"></div>`;
    case 'keyvalue': {
      const rows = block.rows.map(r =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${r.label}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;font-size:13px;color:#111827;">${r.value}</td></tr>`,
      ).join('');
      return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">${rows}</table>`;
    }
    case 'callout': {
      const variants = {
        info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
        warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
        success: { bg: '#f0fdf4', border: '#16a34a', text: '#14532d' },
        error:   { bg: '#fef2f2', border: '#dc2626', text: '#7f1d1d' },
      }[block.variant];
      return `<div style="background:${variants.bg};border-left:3px solid ${variants.border};padding:12px 16px;border-radius:4px;margin:12px 0;font-size:13px;color:${variants.text};line-height:1.5;">${block.text}</div>`;
    }
    case 'footer': {
      const align = block.align ?? 'center';
      return `<p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;text-align:${align};">${block.text}</p>`;
    }
    case 'unsubscribe':
      return `<div style="text-align:center;margin:20px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;">${block.text}</p></div>`;
  }
}

export function blocksToHtml(blocks: EmailBlock[], vars?: Record<string, string>): string {
  return blocks.map(b => {
    let html = blockToHtml(b);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        html = html.replaceAll(`{{${k}}}`, v);
      }
    }
    return html;
  }).join('\n');
}

export function blocksToEmailHtml(blocks: EmailBlock[], accent = readCssAccent()): string {
  const body = blocksToHtml(blocks);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;}
  * { box-sizing: border-box; }
  a { color: inherit; }
</style></head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<div style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="padding:20px 32px;border-bottom:3px solid ${accent};">
    <span style="font-size:18px;font-weight:700;color:${accent};">Company Name</span>
  </div>
  <div style="padding:28px 32px;font-size:14px;line-height:1.6;color:#1a1a1a;">
    ${body}
  </div>
  <div style="padding:16px 32px;border-top:1px solid #e5e7eb;background:#f9fafb;">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">Company Name · Sent via Hudumika</p>
  </div>
</div>
</td></tr></table>
</body></html>`;
}

// ── Shared UI helpers ────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  '#111827', '#374151', '#6b7280', '#9ca3af',
  '#dc2626', '#f59e0b', '#16a34a', '#2563eb',
  '#7c3aed', '#db2777', '#ea580c', '#0891b2',
  '#ffffff', '#f3f4f6', '#e5e7eb',
];

function ColorRow({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div>
      {label && <label className="ebb-props-label">{label}</label>}
      <div className="ebb-color-row">
        <div className="ebb-color-presets">
          {COLOR_PRESETS.map(c => (
            <button key={c} type="button"
              className={`ebb-color-dot${value.toLowerCase() === c.toLowerCase() ? ' ebb-color-dot--active' : ''}`}
              style={{ background: c, border: c === '#ffffff' || c === '#f3f4f6' || c === '#e5e7eb' ? '1px solid #d1d5db' : 'none' }}
              title={c} onClick={() => onChange(c)} />
          ))}
        </div>
        <div className="ebb-color-custom">
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4, flexShrink: 0 }} />
          <Input value={value} onChange={e => onChange(e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} placeholder="#rrggbb" />
        </div>
      </div>
    </div>
  );
}

function AlignGroup({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options?: ('left' | 'center' | 'right')[];
}) {
  const opts = options ?? ['left', 'center', 'right'];
  const ICON_MAP = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight' } as const;
  return (
    <div className="ebb-align-group">
      {opts.map(opt => (
        <Tip key={opt} label={opt.charAt(0).toUpperCase() + opt.slice(1)}>
          <button type="button"
            className={`ebb-align-btn${value === opt ? ' ebb-align-btn--active' : ''}`}
            onClick={() => onChange(opt)}>
            <Icon name={ICON_MAP[opt]} size={13} />
          </button>
        </Tip>
      ))}
    </div>
  );
}

// ── Image uploader ───────────────────────────────────────────────────────────

function ImageUploader({ src, onSrc, label = 'image' }: {
  src: string;
  onSrc: (url: string) => void;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Only image files are accepted.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return; }
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch<{ url: string }>('/v1/email/template-images', { method: 'POST', body: form });
      onSrc(res.url);
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="ebb-image-uploader">
      {src ? (
        <div className="ebb-image-preview">
          <img src={src} alt="Preview" className="ebb-image-preview-img" />
          <div className="ebb-image-preview-actions">
            <button type="button" className="ebb-image-preview-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="image" size={12} /> {uploading ? 'Uploading…' : 'Replace'}
            </button>
            <button type="button" className="ebb-image-preview-btn ebb-image-preview-btn--remove" onClick={() => onSrc('')}>
              <Icon name="x" size={12} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ebb-image-drop" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <>
              <span className="ebb-image-drop-spin"><Icon name="refresh" size={18} /></span>
              <span className="ebb-image-drop-label">Uploading…</span>
            </>
          ) : (
            <>
              <Icon name="image" size={24} className="ebb-image-drop-icon" />
              <span className="ebb-image-drop-label">Click to upload {label}</span>
              <span className="ebb-image-drop-hint">PNG, JPG, GIF, WebP · max 5 MB</span>
            </>
          )}
        </button>
      )}
      {error && <p className="ebb-image-error">{error}</p>}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

// ── Variable insert helper ───────────────────────────────────────────────────

interface VarGroup { label: string; vars: { key: string; label: string; example: string }[] }

// ── Block canvas item ────────────────────────────────────────────────────────

function BlockItem({ block, isSelected, onSelect, onDelete, onDuplicate, onMoveUp, onMoveDown, onDragStart, onDrop, onUpdateSrc, isFirst, isLast }: {
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onUpdateSrc: (src: string) => void;
}) {
  const label = BLOCK_PALETTE.find(p => p.type === block.type)?.label ?? block.type;
  const isMedia = block.type === 'image' || block.type === 'logo';
  const hasNoSrc = isMedia && !(block as any).src;
  const canvasFileRef = useRef<HTMLInputElement>(null);

  async function handleCanvasUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch<{ url: string }>('/v1/email/template-images', { method: 'POST', body: form });
      onUpdateSrc(res.url);
    } catch {}
    if (e.target) e.target.value = '';
  }

  return (
    <div
      className={`ebb-block${isSelected ? ' ebb-block--selected' : ''}`}
      onClick={event => { event.stopPropagation(); onSelect(); }}
      draggable
      tabIndex={0}
      onDragStart={onDragStart}
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); onDrop(); }}
      onKeyDown={event => {
        if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); onMoveUp(); }
        if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); onMoveDown(); }
        if ((event.key === 'Delete' || event.key === 'Backspace') && event.target === event.currentTarget) onDelete();
      }}
    >
      <div className="ebb-block-toolbar">
        <span className="ebb-block-label">{label}</span>
        <div className="ebb-block-actions">
          <Tip label="Move up"><button type="button" className="ebb-action-btn" onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}><Icon name="chevronUp" size={13} /></button></Tip>
          <Tip label="Move down"><button type="button" className="ebb-action-btn" onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}><Icon name="chevronDown" size={13} /></button></Tip>
          <Tip label="Duplicate"><button type="button" className="ebb-action-btn" onClick={e => { e.stopPropagation(); onDuplicate(); }}><Icon name="copy" size={13} /></button></Tip>
          <Tip label="Delete"><button type="button" className="ebb-action-btn ebb-action-btn--danger" onClick={e => { e.stopPropagation(); onDelete(); }}><Icon name="trash" size={13} /></button></Tip>
        </div>
      </div>
      {hasNoSrc ? (
        <button type="button" className="ebb-canvas-media-placeholder"
          onClick={e => { e.stopPropagation(); onSelect(); canvasFileRef.current?.click(); }}>
          <Icon name="image" size={22} className="ebb-canvas-media-icon" />
          <span>Click to upload {block.type}</span>
          <input ref={canvasFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCanvasUpload} />
        </button>
      ) : (
        <div className="ebb-block-preview" dangerouslySetInnerHTML={{ __html: blockToHtml(block) }} />
      )}
    </div>
  );
}

// ── Block properties panel ───────────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
  { value: 'linkedin',  label: 'LinkedIn' },
  { value: 'twitter',   label: 'Twitter / X' },
  { value: 'facebook',  label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube',   label: 'YouTube' },
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'github',    label: 'GitHub' },
  { value: 'website',   label: 'Website / Other' },
];

function BlockProps({ block, onChange, varGroups }: {
  block: EmailBlock;
  onChange: (updated: EmailBlock) => void;
  varGroups: VarGroup[];
}) {
  const [insertTarget, setInsertTarget] = useState<string>('');
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  function insertVar(key: string) {
    const tag = `{{${key}}}`;
    const el = inputRefs.current[insertTarget];
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + tag + el.value.slice(end);
      handleFieldChange(insertTarget, next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      });
    }
  }

  function handleFieldChange(field: string, value: string) {
    onChange({ ...block, [field]: value } as EmailBlock);
  }

  const ref = (field: string) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    inputRefs.current[field] = el;
  };
  const focusField = (field: string) => setInsertTarget(field);

  const varPicker = varGroups.length > 0 ? (
    <div className="ebb-props-vars">
      <div className="ebb-props-vars-hdr">Insert variable</div>
      {varGroups.map(g => (
        <div key={g.label} className="ebb-props-vars-group">
          <div className="ebb-props-vars-group-label">{g.label}</div>
          {g.vars.map(v => (
            <button key={v.key} type="button" className="ebb-props-var-chip" title={v.example}
              onClick={() => insertVar(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  ) : null;

  switch (block.type) {
    case 'heading':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Heading</div>
          <label className="ebb-props-label">Text</label>
          <Input ref={ref('text') as any} value={block.text} onChange={e => handleFieldChange('text', e.target.value)} onFocus={() => focusField('text')} />
          <label className="ebb-props-label">Level</label>
          <Select value={String(block.level)} onValueChange={v => onChange({ ...block, level: Number(v) as 1|2|3 })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">H1 — Large (26px)</SelectItem>
              <SelectItem value="2">H2 — Medium (20px)</SelectItem>
              <SelectItem value="3">H3 — Small (16px)</SelectItem>
            </SelectContent>
          </Select>
          <label className="ebb-props-label">Alignment</label>
          <AlignGroup value={block.align} onChange={v => onChange({ ...block, align: v as any })} />
          <ColorRow label="Text color" value={block.color ?? '#111827'} onChange={c => onChange({ ...block, color: c })} />
          {varPicker}
        </div>
      );

    case 'paragraph':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Paragraph</div>
          <label className="ebb-props-label">Text</label>
          <Textarea ref={ref('text') as any} value={block.text} rows={6} onChange={e => handleFieldChange('text', e.target.value)} onFocus={() => focusField('text')} />
          <label className="ebb-props-label">Alignment</label>
          <AlignGroup value={block.align ?? 'left'} onChange={v => onChange({ ...block, align: v as any })} />
          <label className="ebb-props-label">Font size (px)</label>
          <Input type="number" value={block.fontSize ?? 14} min={11} max={24} step={1} onChange={e => onChange({ ...block, fontSize: Number(e.target.value) })} />
          <ColorRow label="Text color" value={block.color ?? '#374151'} onChange={c => onChange({ ...block, color: c })} />
          {varPicker}
        </div>
      );

    case 'quote':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Quote</div>
          <label className="ebb-props-label">Quote text</label>
          <Textarea ref={ref('text') as any} value={block.text} rows={4} onChange={e => handleFieldChange('text', e.target.value)} onFocus={() => focusField('text')} />
          <label className="ebb-props-label">Author name</label>
          <Input ref={ref('author') as any} value={block.author} onChange={e => handleFieldChange('author', e.target.value)} onFocus={() => focusField('author')} />
          <label className="ebb-props-label">Role / Company (optional)</label>
          <Input ref={ref('role') as any} value={block.role ?? ''} placeholder="CEO, Company Name" onChange={e => handleFieldChange('role', e.target.value)} onFocus={() => focusField('role')} />
          {varPicker}
        </div>
      );

    case 'button':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Button</div>
          <label className="ebb-props-label">Label</label>
          <Input ref={ref('label') as any} value={block.label} onChange={e => handleFieldChange('label', e.target.value)} onFocus={() => focusField('label')} />
          <label className="ebb-props-label">URL</label>
          <Input ref={ref('url') as any} value={block.url} onChange={e => handleFieldChange('url', e.target.value)} onFocus={() => focusField('url')} />
          <label className="ebb-props-label">Alignment</label>
          <AlignGroup value={block.align} onChange={v => onChange({ ...block, align: v as any })} options={['left', 'center']} />
          <ColorRow label="Background color" value={block.color} onChange={c => onChange({ ...block, color: c })} />
          <label className="ebb-props-label">Border radius (px)</label>
          <Input type="number" value={block.borderRadius ?? 6} min={0} max={999} step={1} onChange={e => onChange({ ...block, borderRadius: Number(e.target.value) })} />
          <label className="ebb-props-label">Full width</label>
          <div className="ebb-props-toggle-row">
            <input type="checkbox" id="btn-fullwidth" checked={!!block.fullWidth} onChange={e => onChange({ ...block, fullWidth: e.target.checked })} />
            <label htmlFor="btn-fullwidth" style={{ fontSize: 12, color: 'var(--ink)', cursor: 'pointer' }}>Stretch button to full container width</label>
          </div>
          {varPicker}
        </div>
      );

    case 'social':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Social links</div>
          {block.links.map((link, i) => (
            <div key={i} className="ebb-props-social-row">
              <div className="ebb-props-social-row-head">
                <Select value={link.platform} onValueChange={v => {
                  const links = [...block.links];
                  links[i] = { ...links[i], platform: v, label: SOCIAL_PLATFORMS.find(p => p.value === v)?.label ?? v };
                  onChange({ ...block, links });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOCIAL_PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" className="ebb-action-btn ebb-action-btn--danger" style={{ flexShrink: 0 }}
                  onClick={() => {
                    const links = block.links.filter((_, j) => j !== i);
                    onChange({ ...block, links: links.length ? links : [{ platform: 'website', url: '#', label: 'Website' }] });
                  }}><Icon name="x" size={13} /></button>
              </div>
              <Input value={link.url} placeholder="https://…" onChange={e => {
                const links = [...block.links];
                links[i] = { ...links[i], url: e.target.value };
                onChange({ ...block, links });
              }} />
              <Input value={link.label} placeholder="Label" onChange={e => {
                const links = [...block.links];
                links[i] = { ...links[i], label: e.target.value };
                onChange({ ...block, links });
              }} />
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => onChange({ ...block, links: [...block.links, { platform: 'website', url: '#', label: 'Website' }] })}>
            + Add link
          </Button>
        </div>
      );

    case 'image':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Image</div>
          <ImageUploader src={block.src} onSrc={url => onChange({ ...block, src: url })} label="image" />
          <label className="ebb-props-label">Or paste external URL</label>
          <Input ref={ref('src') as any} value={block.src} placeholder="https://…" onChange={e => handleFieldChange('src', e.target.value)} onFocus={() => focusField('src')} />
          <label className="ebb-props-label">Alt text</label>
          <Input ref={ref('alt') as any} value={block.alt} onChange={e => handleFieldChange('alt', e.target.value)} onFocus={() => focusField('alt')} />
          <label className="ebb-props-label">Width</label>
          <Input value={block.width} placeholder="100% or 300px" onChange={e => onChange({ ...block, width: e.target.value })} />
          <label className="ebb-props-label">Click-through URL (optional)</label>
          <Input ref={ref('link') as any} value={block.link ?? ''} placeholder="https://… (makes image clickable)" onChange={e => handleFieldChange('link', e.target.value)} onFocus={() => focusField('link')} />
          <label className="ebb-props-label">Border radius</label>
          <Input value={block.borderRadius ?? ''} placeholder="e.g. 8px or 50%" onChange={e => onChange({ ...block, borderRadius: e.target.value })} />
          <label className="ebb-props-label">Alignment</label>
          <AlignGroup value={block.align} onChange={v => onChange({ ...block, align: v as any })} options={['left', 'center']} />
        </div>
      );

    case 'logo':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Logo</div>
          <ImageUploader src={block.src} onSrc={url => onChange({ ...block, src: url })} label="logo" />
          <label className="ebb-props-label">Or paste external URL</label>
          <Input ref={ref('src') as any} value={block.src} placeholder="https://…" onChange={e => handleFieldChange('src', e.target.value)} onFocus={() => focusField('src')} />
          <label className="ebb-props-label">Alt text</label>
          <Input ref={ref('alt') as any} value={block.alt} onChange={e => handleFieldChange('alt', e.target.value)} onFocus={() => focusField('alt')} />
          <label className="ebb-props-label">Width</label>
          <Input value={block.width} placeholder="160px" onChange={e => onChange({ ...block, width: e.target.value })} />
          <label className="ebb-props-label">Alignment</label>
          <AlignGroup value={block.align} onChange={v => onChange({ ...block, align: v as any })} />
        </div>
      );

    case 'banner':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Banner</div>
          <label className="ebb-props-label">Headline</label>
          <Input ref={ref('title') as any} value={block.title} onChange={e => handleFieldChange('title', e.target.value)} onFocus={() => focusField('title')} />
          <label className="ebb-props-label">Subheading (optional)</label>
          <Input ref={ref('subtitle') as any} value={block.subtitle ?? ''} placeholder="Supporting text" onChange={e => handleFieldChange('subtitle', e.target.value)} onFocus={() => focusField('subtitle')} />
          <ColorRow label="Background color" value={block.bgColor} onChange={c => onChange({ ...block, bgColor: c })} />
          <ColorRow label="Text color" value={block.textColor} onChange={c => onChange({ ...block, textColor: c })} />
          {varPicker}
        </div>
      );

    case 'divider':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Divider</div>
          <label className="ebb-props-label">Line style</label>
          <Select value={block.style ?? 'solid'} onValueChange={v => onChange({ ...block, style: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="dashed">Dashed</SelectItem>
              <SelectItem value="dotted">Dotted</SelectItem>
            </SelectContent>
          </Select>
          <label className="ebb-props-label">Thickness (px)</label>
          <Input type="number" value={block.thickness ?? 1} min={1} max={8} step={1} onChange={e => onChange({ ...block, thickness: Number(e.target.value) })} />
          <ColorRow label="Line color" value={block.color ?? '#e5e7eb'} onChange={c => onChange({ ...block, color: c })} />
        </div>
      );

    case 'spacer':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Spacer</div>
          <label className="ebb-props-label">Height (px)</label>
          <Input type="number" value={block.size} min={4} max={120} step={4} onChange={e => onChange({ ...block, size: Number(e.target.value) })} />
          <div className="ebb-props-hint">Drag the edges of the spacer on the canvas, or type a value here.</div>
        </div>
      );

    case 'keyvalue':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Key–Value Table</div>
          {block.rows.map((row, i) => (
            <div key={i} className="ebb-props-kv-row">
              <Input
                ref={ref(`kv-label-${i}`) as any}
                value={row.label}
                placeholder="Label"
                onChange={e => {
                  const rows = [...block.rows];
                  rows[i] = { ...rows[i], label: e.target.value };
                  onChange({ ...block, rows });
                }}
                onFocus={() => focusField(`kv-label-${i}`)}
              />
              <Input
                ref={ref(`kv-value-${i}`) as any}
                value={row.value}
                placeholder="Value / {{variable}}"
                onChange={e => {
                  const rows = [...block.rows];
                  rows[i] = { ...rows[i], value: e.target.value };
                  onChange({ ...block, rows });
                }}
                onFocus={() => focusField(`kv-value-${i}`)}
              />
              <button type="button" className="ebb-action-btn ebb-action-btn--danger" onClick={() => {
                const rows = block.rows.filter((_, j) => j !== i);
                onChange({ ...block, rows: rows.length ? rows : [{ label: '', value: '' }] });
              }}><Icon name="x" size={13} /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => onChange({ ...block, rows: [...block.rows, { label: '', value: '' }] })}>
            + Add row
          </Button>
          {varPicker}
        </div>
      );

    case 'callout':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Callout</div>
          <label className="ebb-props-label">Text</label>
          <Textarea ref={ref('text') as any} value={block.text} rows={4} onChange={e => handleFieldChange('text', e.target.value)} onFocus={() => focusField('text')} />
          <label className="ebb-props-label">Style</label>
          <Select value={block.variant} onValueChange={v => onChange({ ...block, variant: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info (blue)</SelectItem>
              <SelectItem value="success">Success (green)</SelectItem>
              <SelectItem value="warning">Warning (amber)</SelectItem>
              <SelectItem value="error">Error (red)</SelectItem>
            </SelectContent>
          </Select>
          {varPicker}
        </div>
      );

    case 'footer':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Footer</div>
          <label className="ebb-props-label">Text</label>
          <Textarea ref={ref('text') as any} value={block.text} rows={3} onChange={e => handleFieldChange('text', e.target.value)} onFocus={() => focusField('text')} />
          <label className="ebb-props-label">Alignment</label>
          <AlignGroup value={block.align ?? 'center'} onChange={v => onChange({ ...block, align: v as any })} />
          {varPicker}
        </div>
      );

    case 'unsubscribe':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Unsubscribe</div>
          <label className="ebb-props-label">Text (HTML allowed)</label>
          <Textarea ref={ref('text') as any} value={block.text} rows={4} onChange={e => handleFieldChange('text', e.target.value)} onFocus={() => focusField('text')} />
          <p className="ebb-props-hint">Use <code>{"{{unsubscribe_url}}"}</code> for the unsubscribe link and <code>{"{{preferences_url}}"}</code> for preference management.</p>
          {varPicker}
        </div>
      );
  }
}

// ── Main EmailBlockBuilder component ─────────────────────────────────────────

export interface EmailBlockBuilderProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  varGroups?: VarGroup[];
  accentColor?: string;
}

export function EmailBlockBuilder({ blocks, onChange, varGroups = [], accentColor }: EmailBlockBuilderProps) {
  const accent = accentColor ?? readCssAccent();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(() => blocks.length ? 0 : null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [search, setSearch] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Set<BlockCategory>>(new Set());
  const dragIndex = useRef<number | null>(null);
  const dragPaletteType = useRef<BlockType | null>(null);
  const [undoStack, setUndoStack] = useState<EmailBlock[][]>([]);
  const [redoStack, setRedoStack] = useState<EmailBlock[][]>([]);

  const commit = useCallback((next: EmailBlock[]) => {
    setUndoStack(history => [...history.slice(-49), blocks]);
    setRedoStack([]);
    onChange(next);
  }, [blocks, onChange]);

  const selectedBlock = selectedIdx !== null ? blocks[selectedIdx] ?? null : null;

  useEffect(() => {
    if (!blocks.length) setSelectedIdx(null);
    else if (selectedIdx === null || selectedIdx >= blocks.length) setSelectedIdx(0);
  }, [blocks.length, selectedIdx]);

  const addBlock = useCallback((type: BlockType) => {
    const next = [...blocks, newBlock(type)];
    commit(next);
    setSelectedIdx(next.length - 1);
  }, [blocks, commit]);

  const updateBlock = useCallback((idx: number, updated: EmailBlock) => {
    commit(blocks.map((b, i) => i === idx ? updated : b));
  }, [blocks, commit]);

  const deleteBlock = useCallback((idx: number) => {
    commit(blocks.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  }, [blocks, commit]);

  const moveBlock = useCallback((idx: number, dir: -1 | 1) => {
    const next = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
    setSelectedIdx(target);
  }, [blocks, commit]);

  const duplicateBlock = useCallback((idx: number) => {
    const clone = { ...blocks[idx], id: Math.random().toString(36).slice(2) } as EmailBlock;
    const next = [...blocks.slice(0, idx + 1), clone, ...blocks.slice(idx + 1)];
    commit(next);
    setSelectedIdx(idx + 1);
  }, [blocks, commit]);

  const dropBlock = useCallback((target: number) => {
    if (dragPaletteType.current) {
      const created = newBlock(dragPaletteType.current);
      dragPaletteType.current = null;
      const next = [...blocks.slice(0, target), created, ...blocks.slice(target)];
      commit(next);
      setSelectedIdx(target);
      return;
    }
    const source = dragIndex.current;
    dragIndex.current = null;
    if (source === null || source === target) return;
    const next = [...blocks];
    const [moved] = next.splice(source, 1);
    next.splice(target, 0, moved);
    commit(next);
    setSelectedIdx(target);
  }, [blocks, commit]);

  const dropAtEnd = useCallback(() => {
    if (!dragPaletteType.current) return;
    const created = newBlock(dragPaletteType.current);
    dragPaletteType.current = null;
    const next = [...blocks, created];
    commit(next);
    setSelectedIdx(next.length - 1);
  }, [blocks, commit]);

  const undo = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack(stack => stack.slice(0, -1));
    setRedoStack(stack => [...stack, blocks]);
    onChange(previous);
    setSelectedIdx(null);
  }, [blocks, onChange, undoStack]);

  const redo = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack(stack => stack.slice(0, -1));
    setUndoStack(stack => [...stack, blocks]);
    onChange(next);
    setSelectedIdx(null);
  }, [blocks, onChange, redoStack]);

  const toggleCat = (cat: BlockCategory) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Filtered palette
  const searchLower = search.trim().toLowerCase();
  const filteredPalette = searchLower
    ? BLOCK_PALETTE.filter(p => p.label.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower))
    : null; // null = show categories

  return (
    <div className="ebb-root">
      {/* LEFT — palette */}
      <div className="ebb-panel ebb-panel--left">
        <div className="ebb-panel-hdr">
          <span>Blocks</span>
          <Badge variant="gray">{blocks.length}</Badge>
        </div>
        <div className="ebb-palette-search">
          <Icon name="search" size={13} className="ebb-palette-search-icon" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search blocks…"
            className="ebb-palette-search-input"
          />
          {search && (
            <button type="button" className="ebb-palette-search-clear" onClick={() => setSearch('')}>
              <Icon name="x" size={11} />
            </button>
          )}
        </div>

        {filteredPalette ? (
          // Search results — flat list
          <div className="ebb-palette">
            {filteredPalette.length === 0
              ? <p className="ebb-palette-empty">No blocks match.</p>
              : filteredPalette.map(p => (
                  <button key={p.type} type="button" className="ebb-palette-item"
                    draggable onDragStart={() => { dragPaletteType.current = p.type; dragIndex.current = null; }}
                    onClick={() => addBlock(p.type)}>
                    <Icon name={p.icon as any} size={15} className="ebb-palette-icon" />
                    <div className="ebb-palette-info">
                      <div className="ebb-palette-label">{p.label}</div>
                      <div className="ebb-palette-desc">{p.description}</div>
                    </div>
                  </button>
                ))}
          </div>
        ) : (
          // Categorised view
          BLOCK_CATEGORIES.map(cat => {
            const items = BLOCK_PALETTE.filter(p => p.category === cat);
            const collapsed = collapsedCats.has(cat);
            return (
              <div key={cat} className="ebb-palette-cat">
                <button type="button" className="ebb-palette-cat-hdr" onClick={() => toggleCat(cat)}>
                  <span>{cat}</span>
                  <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={11} />
                </button>
                {!collapsed && (
                  <div className="ebb-palette">
                    {items.map(p => (
                      <button key={p.type} type="button" className="ebb-palette-item"
                        draggable onDragStart={() => { dragPaletteType.current = p.type; dragIndex.current = null; }}
                        onClick={() => addBlock(p.type)}>
                        <Icon name={p.icon as any} size={15} className="ebb-palette-icon" />
                        <div className="ebb-palette-info">
                          <div className="ebb-palette-label">{p.label}</div>
                          <div className="ebb-palette-desc">{p.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CENTER — canvas */}
      <div className="ebb-canvas-wrap">
        <div className="ebb-canvas-toolbar">
          <div className="ebb-canvas-preview-toggle">
            <button type="button" className={`ebb-preview-btn${previewMode === 'desktop' ? ' ebb-preview-btn--active' : ''}`} onClick={() => setPreviewMode('desktop')}>
              <Icon name="monitor" size={14} /> Desktop
            </button>
            <button type="button" className={`ebb-preview-btn${previewMode === 'mobile' ? ' ebb-preview-btn--active' : ''}`} onClick={() => setPreviewMode('mobile')}>
              <Icon name="smartphone" size={14} /> Mobile
            </button>
          </div>
          <div className="ebb-canvas-history">
            <Tip label="Undo (Ctrl+Z)">
              <Button size="sm" variant="ghost" onClick={undo} disabled={!undoStack.length}>
                <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}><Icon name="refresh" size={13} /></span> Undo
              </Button>
            </Tip>
            <Tip label="Redo (Ctrl+Y)">
              <Button size="sm" variant="ghost" onClick={redo} disabled={!redoStack.length}>
                <Icon name="refresh" size={13} /> Redo
              </Button>
            </Tip>
          </div>
        </div>

        <div className="ebb-canvas-outer" onClick={() => setSelectedIdx(null)}
          onDragOver={event => event.preventDefault()}
          onDrop={event => { if (event.target === event.currentTarget) { event.preventDefault(); dropAtEnd(); } }}>
          <div className={`ebb-canvas ${previewMode === 'mobile' ? 'ebb-canvas--mobile' : 'ebb-canvas--desktop'}`}>
            {blocks.length === 0 ? (
              <div className="ebb-canvas-empty"
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); event.stopPropagation(); dropAtEnd(); }}>
                <Icon name="grid" size={32} className="ebb-canvas-empty-icon" />
                <p>Click or drag a block from the panel on the left to start building.</p>
              </div>
            ) : (
              <div className="ebb-canvas-email"
                onDragOver={event => event.preventDefault()}
                onDrop={event => { if (event.target === event.currentTarget) { event.preventDefault(); dropAtEnd(); } }}>
                <div className="ebb-canvas-email-header" style={{ borderBottomColor: accent }}>
                  <span style={{ color: accent, fontWeight: 700, fontSize: 18 }}>Company Name</span>
                </div>
                <div className="ebb-canvas-email-body">
                  {blocks.map((b, i) => (
                    <BlockItem
                      key={b.id}
                      block={b}
                      isSelected={selectedIdx === i}
                      onSelect={() => setSelectedIdx(i)}
                      onDelete={() => deleteBlock(i)}
                      onDuplicate={() => duplicateBlock(i)}
                      onMoveUp={() => moveBlock(i, -1)}
                      onMoveDown={() => moveBlock(i, 1)}
                      isFirst={i === 0}
                      isLast={i === blocks.length - 1}
                      onDragStart={() => { dragIndex.current = i; }}
                      onDrop={() => dropBlock(i)}
                      onUpdateSrc={src => updateBlock(i, { ...b, src } as EmailBlock)}
                    />
                  ))}
                </div>
                <div className="ebb-canvas-email-footer">
                  <span>Company Name · Sent via Hudumika</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT — properties */}
      <div className="ebb-panel ebb-panel--right">
        <div className="ebb-panel-hdr">
          <span>{selectedBlock ? 'Block settings' : 'Inspector'}</span>
          {selectedBlock && (
            <Badge variant="brand" style={{ textTransform: 'capitalize', letterSpacing: 0 }}>
              {BLOCK_PALETTE.find(p => p.type === selectedBlock.type)?.label ?? selectedBlock.type}
            </Badge>
          )}
        </div>
        {selectedBlock ? (
          <BlockProps
            block={selectedBlock}
            onChange={updated => updateBlock(selectedIdx!, updated)}
            varGroups={varGroups}
          />
        ) : (
          <div className="ebb-props-empty">
            <Icon name="hand" size={28} className="ebb-props-empty-icon" />
            <p>Select a block on the canvas to edit its properties</p>
          </div>
        )}
      </div>
    </div>
  );
}
