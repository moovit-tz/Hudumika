/**
 * EmailBlockBuilder — drag-and-drop block editor for email templates.
 *
 * Architecture:
 *   LEFT  — block palette + variable picker
 *   CENTER — 760px rendered canvas (live iframe preview)
 *   RIGHT  — selected block properties panel
 *
 * Emits email-safe HTML (inline styles, table-based layout where needed).
 * No external library dependencies.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Textarea } from './ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
import { Tip } from './ui/tooltip.js';
import './EmailBlockBuilder.css';

// ── Block types ──────────────────────────────────────────────────────────────

export type EmailBlock =
  | { id: string; type: 'heading'; text: string; level: 1 | 2 | 3; align: 'left' | 'center' }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'button'; label: string; url: string; align: 'left' | 'center'; color: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; size: number }
  | { id: string; type: 'image'; src: string; alt: string; width: string; align: 'left' | 'center' }
  | { id: string; type: 'keyvalue'; rows: { label: string; value: string }[] }
  | { id: string; type: 'callout'; text: string; variant: 'info' | 'warning' | 'success' | 'error' }
  | { id: string; type: 'footer'; text: string };

type BlockType = EmailBlock['type'];

const BLOCK_PALETTE: { type: BlockType; label: string; icon: string; description: string }[] = [
  { type: 'heading', label: 'Heading', icon: 'type', description: 'H1 / H2 / H3 title' },
  { type: 'paragraph', label: 'Text', icon: 'alignLeft', description: 'Body paragraph' },
  { type: 'button', label: 'Button', icon: 'mousePointerClick', description: 'Call-to-action link' },
  { type: 'divider', label: 'Divider', icon: 'minus', description: 'Horizontal rule' },
  { type: 'spacer', label: 'Spacer', icon: 'arrowUpDown', description: 'Vertical gap' },
  { type: 'image', label: 'Image', icon: 'image', description: 'Image with alt text' },
  { type: 'keyvalue', label: 'Key–Value Table', icon: 'table', description: 'Label/value rows (invoices etc.)' },
  { type: 'callout', label: 'Callout', icon: 'alertCircle', description: 'Highlighted info/warning box' },
  { type: 'footer', label: 'Footer', icon: 'text', description: 'Footer / disclaimer text' },
];

function newBlock(type: BlockType): EmailBlock {
  const id = Math.random().toString(36).slice(2);
  switch (type) {
    case 'heading': return { id, type, text: 'Heading text', level: 2, align: 'left' };
    case 'paragraph': return { id, type, text: 'Your paragraph text here.' };
    case 'button': return { id, type, label: 'Click here', url: '#', align: 'center', color: '#0d7a6b' };
    case 'divider': return { id, type };
    case 'spacer': return { id, type, size: 24 };
    case 'image': return { id, type, src: '', alt: '', width: '100%', align: 'center' };
    case 'keyvalue': return { id, type, rows: [{ label: 'Label', value: 'Value' }] };
    case 'callout': return { id, type, text: 'Important note here.', variant: 'info' };
    case 'footer': return { id, type, text: 'This is an automated message. Please do not reply.' };
  }
}

// ── HTML generation ──────────────────────────────────────────────────────────

function blockToHtml(block: EmailBlock): string {
  switch (block.type) {
    case 'heading': {
      const sizes = { 1: '24px', 2: '20px', 3: '16px' };
      return `<h${block.level} style="margin:0 0 12px;font-size:${sizes[block.level]};font-weight:700;color:#111827;text-align:${block.align};">${block.text}</h${block.level}>`;
    }
    case 'paragraph':
      return `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#374151;">${block.text.replace(/\n/g, '<br />')}</p>`;
    case 'button': {
      const wrap = block.align === 'center' ? ' text-align:center;' : '';
      return `<div style="margin:16px 0;${wrap}"><a href="${block.url}" style="background:${block.color};color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-size:14px;font-weight:600;">${block.label}</a></div>`;
    }
    case 'divider':
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />`;
    case 'spacer':
      return `<div style="height:${block.size}px;"></div>`;
    case 'image': {
      const w = block.width === '100%' ? '100%' : block.width;
      const imgStyle = `display:block;max-width:${w};height:auto;${block.align === 'center' ? 'margin:0 auto;' : ''}`;
      return `<div style="margin:12px 0;">${block.src ? `<img src="${block.src}" alt="${block.alt}" style="${imgStyle}" />` : `<div style="background:#f3f4f6;border:2px dashed #d1d5db;height:80px;display:flex;align-items:center;justify-content:center;border-radius:4px;color:#9ca3af;font-size:13px;">[Image placeholder]</div>`}</div>`;
    }
    case 'keyvalue': {
      const rows = block.rows.map(r =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${r.label}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;font-size:13px;">${r.value}</td></tr>`,
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
    case 'footer':
      return `<p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">${block.text}</p>`;
  }
}

export function blocksToHtml(blocks: EmailBlock[], vars?: Record<string, string>): string {
  const content = blocks.map(b => {
    let html = blockToHtml(b);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        html = html.replaceAll(`{{${k}}}`, v);
      }
    }
    return html;
  }).join('\n');
  return content;
}

// ── Variable insert helper ───────────────────────────────────────────────────

interface VarGroup { label: string; vars: { key: string; label: string; example: string }[] }

// ── Block canvas item ────────────────────────────────────────────────────────

function BlockItem({ block, isSelected, onSelect, onDelete, onDuplicate, onMoveUp, onMoveDown, onDragStart, onDrop, isFirst, isLast }: {
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
}) {
  const label = BLOCK_PALETTE.find(p => p.type === block.type)?.label ?? block.type;
  return (
    <div
      className={`ebb-block${isSelected ? ' ebb-block--selected' : ''}`}
      onClick={onSelect}
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
      <div
        className="ebb-block-preview"
        dangerouslySetInnerHTML={{ __html: blockToHtml(block) }}
      />
    </div>
  );
}

// ── Block properties panel ───────────────────────────────────────────────────

function BlockProps({ block, onChange, varGroups }: {
  block: EmailBlock;
  onChange: (updated: EmailBlock) => void;
  varGroups: VarGroup[];
}) {
  const [insertTarget, setInsertTarget] = useState<string>(''); // field key for var insertion
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  function insertVar(key: string) {
    const tag = `{{${key}}}`;
    const el = inputRefs.current[insertTarget];
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + tag + el.value.slice(end);
      // Trigger change
      const fieldName = insertTarget;
      handleFieldChange(fieldName, next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      });
    }
  }

  function handleFieldChange(field: string, value: string) {
    onChange({ ...block, [field]: value } as EmailBlock);
  }

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

  const ref = (field: string) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    inputRefs.current[field] = el;
  };

  const focusField = (field: string) => setInsertTarget(field);

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
              <SelectItem value="1">H1 — Large</SelectItem>
              <SelectItem value="2">H2 — Medium</SelectItem>
              <SelectItem value="3">H3 — Small</SelectItem>
            </SelectContent>
          </Select>
          <label className="ebb-props-label">Alignment</label>
          <Select value={block.align} onValueChange={v => onChange({ ...block, align: v as 'left'|'center' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
            </SelectContent>
          </Select>
          {varPicker}
        </div>
      );
    case 'paragraph':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Paragraph</div>
          <label className="ebb-props-label">Text</label>
          <Textarea ref={ref('text') as any} value={block.text} rows={6} onChange={e => handleFieldChange('text', e.target.value)} onFocus={() => focusField('text')} />
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
          <label className="ebb-props-label">Background color</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={block.color} onChange={e => onChange({ ...block, color: e.target.value })} style={{ width: 32, height: 32, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4 }} />
            <Input value={block.color} onChange={e => onChange({ ...block, color: e.target.value })} style={{ flex: 1 }} />
          </div>
          <label className="ebb-props-label">Alignment</label>
          <Select value={block.align} onValueChange={v => onChange({ ...block, align: v as 'left'|'center' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
            </SelectContent>
          </Select>
          {varPicker}
        </div>
      );
    case 'divider':
      return <div className="ebb-props"><div className="ebb-props-title">Divider</div><p className="ebb-props-hint">A horizontal rule with no configurable properties.</p></div>;
    case 'spacer':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Spacer</div>
          <label className="ebb-props-label">Height (px)</label>
          <Input type="number" value={block.size} min={4} max={120} step={4} onChange={e => onChange({ ...block, size: Number(e.target.value) })} />
        </div>
      );
    case 'image':
      return (
        <div className="ebb-props">
          <div className="ebb-props-title">Image</div>
          <label className="ebb-props-label">URL</label>
          <Input ref={ref('src') as any} value={block.src} placeholder="https://…" onChange={e => handleFieldChange('src', e.target.value)} onFocus={() => focusField('src')} />
          <label className="ebb-props-label">Alt text</label>
          <Input ref={ref('alt') as any} value={block.alt} onChange={e => handleFieldChange('alt', e.target.value)} onFocus={() => focusField('alt')} />
          <label className="ebb-props-label">Width</label>
          <Input value={block.width} placeholder="100% or 300px" onChange={e => onChange({ ...block, width: e.target.value })} />
          <label className="ebb-props-label">Alignment</label>
          <Select value={block.align} onValueChange={v => onChange({ ...block, align: v as 'left'|'center' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
            </SelectContent>
          </Select>
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
              <SelectItem value="warning">Warning (yellow)</SelectItem>
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
          {varPicker}
        </div>
      );
  }
}

// ── Full email HTML wrapper for preview ──────────────────────────────────────

function wrapPreviewHtml(blocks: EmailBlock[], accent = '#0d7a6b'): string {
  const body = blocksToHtml(blocks);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;}
  * { box-sizing: border-box; }
</style></head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<div style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
  <div style="padding:20px 32px;border-bottom:3px solid ${accent};">
    <span style="font-size:18px;font-weight:700;color:${accent};">Company Name</span>
  </div>
  <div style="padding:24px 32px;font-size:14px;line-height:1.6;color:#1a1a1a;">
    ${body}
  </div>
  <div style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
    <p style="margin:0;">Company Name · Sent via Hudumika</p>
  </div>
</div>
</td></tr></table>
</body></html>`;
}

// ── Main EmailBlockBuilder component ─────────────────────────────────────────

export interface EmailBlockBuilderProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  varGroups?: VarGroup[];
  accentColor?: string;
}

export function EmailBlockBuilder({ blocks, onChange, varGroups = [], accentColor = '#0d7a6b' }: EmailBlockBuilderProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [undoStack, setUndoStack] = useState<EmailBlock[][]>([]);
  const [redoStack, setRedoStack] = useState<EmailBlock[][]>([]);

  const commit = useCallback((next: EmailBlock[]) => {
    setUndoStack(history => [...history.slice(-49), blocks]);
    setRedoStack([]);
    onChange(next);
  }, [blocks, onChange]);

  const selectedBlock = selectedIdx !== null ? blocks[selectedIdx] ?? null : null;

  const addBlock = useCallback((type: BlockType) => {
    const next = [...blocks, newBlock(type)];
    commit(next);
    setSelectedIdx(next.length - 1);
  }, [blocks, commit]);

  const updateBlock = useCallback((idx: number, updated: EmailBlock) => {
    const next = blocks.map((b, i) => i === idx ? updated : b);
    commit(next);
  }, [blocks, commit]);

  const deleteBlock = useCallback((idx: number) => {
    const next = blocks.filter((_, i) => i !== idx);
    commit(next);
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
    const source = dragIndex.current;
    dragIndex.current = null;
    if (source === null || source === target) return;
    const next = [...blocks];
    const [moved] = next.splice(source, 1);
    next.splice(target, 0, moved);
    commit(next);
    setSelectedIdx(target);
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

  // Keep iframe in sync with blocks
  useEffect(() => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(wrapPreviewHtml(blocks, accentColor));
      doc.close();
    }
  }, [blocks, accentColor]);

  return (
    <div className="ebb-root">
      {/* LEFT — palette */}
      <div className="ebb-panel ebb-panel--left">
        <div className="ebb-panel-hdr">Blocks</div>
        <div className="ebb-palette">
          {BLOCK_PALETTE.map(p => (
            <button key={p.type} type="button" className="ebb-palette-item" onClick={() => addBlock(p.type)}>
              <Icon name={p.icon as any} size={16} className="ebb-palette-icon" />
              <div className="ebb-palette-info">
                <div className="ebb-palette-label">{p.label}</div>
                <div className="ebb-palette-desc">{p.description}</div>
              </div>
            </button>
          ))}
        </div>
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
            <Button size="sm" variant="ghost" onClick={undo} disabled={!undoStack.length}><Icon name="arrowLeft" size={14} /> Undo</Button>
            <Button size="sm" variant="ghost" onClick={redo} disabled={!redoStack.length}><Icon name="arrowRight" size={14} /> Redo</Button>
          </div>
        </div>

        <div className="ebb-canvas-outer" onClick={() => setSelectedIdx(null)}>
          {/* Block list overlay (for selection/reorder) */}
          <div className={`ebb-canvas ${previewMode === 'mobile' ? 'ebb-canvas--mobile' : 'ebb-canvas--desktop'}`}>
            {blocks.length === 0 ? (
              <div className="ebb-canvas-empty">
                <Icon name="grid" size={32} className="ebb-canvas-empty-icon" />
                <p>Click a block in the palette to start building your email</p>
              </div>
            ) : (
              <div className="ebb-canvas-email">
                <div className="ebb-canvas-email-header" style={{ borderBottomColor: accentColor }}>
                  <span style={{ color: accentColor, fontWeight: 700, fontSize: 18 }}>Company Name</span>
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
        {selectedBlock ? (
          <BlockProps
            block={selectedBlock}
            onChange={updated => updateBlock(selectedIdx!, updated)}
            varGroups={varGroups}
          />
        ) : (
          <div className="ebb-props-empty">
            <Icon name="hand" size={28} className="ebb-props-empty-icon" />
            <p>Select a block to edit its properties</p>
          </div>
        )}
      </div>
    </div>
  );
}
