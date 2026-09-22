import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Icon } from './Icon.js';
import { BlockPreview, applyComponentOverrides, isSlottableBlockType, listComponentSlots, describeVisibility } from './BlockPreview.js';
import { Banner } from './ui/alert.js';
import { auditBlocksAccessibility } from '../lib/blockAccessibility.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import type { CmsBlock, CmsBlockType, CmsBlockVisibility } from '@hudumika/types';
import './BlockEditor.css';

function uid() { return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

const BLOCK_META: Record<CmsBlockType, { label: string; glyph: string; empty: () => Record<string, unknown> }> = {
  paragraph: { label: 'Paragraph', glyph: '¶',  empty: () => ({ text: '' }) },
  heading:   { label: 'Heading',   glyph: 'H',  empty: () => ({ text: '', level: 2 }) },
  image:     { label: 'Image',     glyph: '▨',  empty: () => ({ url: '', alt: '' }) },
  list:      { label: 'List',      glyph: '≡',  empty: () => ({ items: [''], ordered: false }) },
  quote:     { label: 'Quote',     glyph: '"',  empty: () => ({ text: '' }) },
  button:    { label: 'Button',    glyph: '▭',  empty: () => ({ label: '', url: '' }) },
  divider:   { label: 'Divider',   glyph: '—',  empty: () => ({}) },
  component: { label: 'Component', glyph: '◈',  empty: () => ({ componentId: '' }) },
  // §30-31 — a form block references its form by `key`, not `id` (see
  // cms-content.service.ts's sanitizeBlock for why: it self-fetches its
  // own public shape at render time, and every public route in this
  // codebase resolves by a stable slug/key, never a raw internal id).
  form:      { label: 'Form',      glyph: '📝', empty: () => ({ formKey: '' }) },
  // §35 — same self-fetching-by-key convention as 'form' above.
  experiment: { label: 'A/B Test', glyph: '⚗',  empty: () => ({ experimentKey: '' }) },
  // §5 — url must clear an allow-listed-provider check server-side
  // (cms-content.service.ts's checkEmbedUrl), not any https:// url.
  embed:     { label: 'Embed',     glyph: '▶',  empty: () => ({ url: '', title: '' }) },
};
const BLOCK_ORDER: CmsBlockType[] = ['paragraph', 'heading', 'image', 'list', 'quote', 'button', 'divider', 'component', 'form', 'experiment', 'embed'];

export interface ComponentOption { id: string; name: string }

/**
 * A real block editor — content is an ordered array of typed blocks, not
 * one HTML string, so it can support what the brief's §5 actually asks
 * for: a slash-command palette and real reordering. Deliberately built for
 * the new 'blocks' field type on the Content Model system rather than
 * retrofitting Pages/Posts' own RichTextEditor (contentEditable + HTML
 * blob) — see cms.ts's own CmsBlock comment for why.
 *
 * A narrow, deliberately-scoped step toward §6's Visual Designer: each
 * block renders in its real, final form (via the same BlockPreview the
 * public site uses) by default — a canvas, not a stack of form fields —
 * and clicking one switches just that block into an inline editing form.
 * Only one block edits at a time, closed by an explicit "Done" control
 * rather than a document-wide click-outside listener (the same reasoning
 * that already ruled out a hand-rolled dropdown elsewhere in this
 * codebase: a global listener is a common source of half-working
 * interactions, an explicit control isn't). Reordering stays up/down
 * buttons, not HTML5 drag-and-drop, for the same reliability reason.
 */
export function BlockEditor({ value, onChange, components, componentBlocks, allowComponents = true, forms, experiments }: {
  value: CmsBlock[]; onChange: (blocks: CmsBlock[]) => void;
  /** Options for the 'component' block's picker — omit or pass [] where none exist yet. */
  components?: ComponentOption[];
  /** Full component blocks, keyed by id, so a placed component renders its real content on the canvas rather than just a name chip — omit where unavailable (e.g. CMSComponents.tsx, where components can't nest anyway). */
  componentBlocks?: Record<string, CmsBlock[]>;
  /** false when editing a component's own definition — a component can't reference another component (no nesting), so its own "+ Add block" picker leaves the Component type out entirely. */
  allowComponents?: boolean;
  /** §30-31 — options for the 'form' block's picker (key/name only — the canvas's own read-only preview, via CollapsedBlock's BlockPreview fallback, self-fetches the real field list by key). */
  forms?: { key: string; name: string }[];
  /** §35 — options for the 'experiment' block's picker (key/name only — same self-fetching-preview reasoning as forms above). */
  experiments?: { key: string; name: string }[];
}) {
  const isPlaceholder = value.length === 0;
  const blocks = isPlaceholder ? [{ id: uid(), type: 'paragraph' as const, props: { text: '' } }] : value;
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const blockOrder = allowComponents ? BLOCK_ORDER : BLOCK_ORDER.filter(t => t !== 'component');
  // §58 — a real audit over the structured block data, not a heuristic over
  // an HTML blob. Recomputed on every change so it stays accurate as the
  // content is edited, not just at save time.
  const a11yIssues = useMemo(() => (isPlaceholder ? [] : auditBlocksAccessibility(blocks)), [blocks, isPlaceholder]);

  function set(next: CmsBlock[]) { onChange(next); }
  function updateBlock(i: number, props: Record<string, unknown>) {
    set(blocks.map((b, idx) => idx === i ? { ...b, props: { ...b.props, ...props } } : b));
  }
  function insertBlock(i: number, type: CmsBlockType) {
    const nb: CmsBlock = { id: uid(), type, props: BLOCK_META[type].empty() };
    const next = [...blocks];
    next.splice(i + 1, 0, nb);
    set(next);
    setPickerAt(null);
    setEditingId(nb.id); // a freshly-added block opens straight into edit mode — nothing to click on yet
  }
  function removeBlock(i: number) {
    set(blocks.length > 1 ? blocks.filter((_, idx) => idx !== i) : blocks);
  }
  function duplicateBlock(i: number) {
    const copy = { ...blocks[i], id: uid(), props: { ...blocks[i].props } };
    const next = [...blocks];
    next.splice(i + 1, 0, copy);
    set(next);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  }
  // §34 — a block's visibility rule lives outside `props` (see cms.ts's own
  // CmsBlock comment for why: it's cross-cutting across every block type,
  // not one more per-type prop), so it needs its own update path rather
  // than reusing updateBlock's props-only merge.
  function updateVisibility(i: number, visibility: CmsBlockVisibility | undefined) {
    set(blocks.map((b, idx) => idx === i ? { ...b, visibility } : b));
  }

  return (
    <div className="be-wrap">
      {a11yIssues.length > 0 && (
        <Banner variant="warning" title={`${a11yIssues.length} accessibility ${a11yIssues.length === 1 ? 'issue' : 'issues'}`} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {a11yIssues.map(issue => (
              <button key={issue.blockId} type="button" onClick={() => setEditingId(issue.blockId)}
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                {issue.message}
              </button>
            ))}
          </div>
        </Banner>
      )}
      {blocks.map((block, i) => {
        const editing = isPlaceholder || editingId === block.id;
        return (
          <div key={block.id} className={`be-block${editing ? ' be-block-editing' : ''}`}>
            <div className="be-block-controls">
              <button type="button" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrowUp" size={12} /></button>
              <button type="button" title="Move down" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><Icon name="arrowDown" size={12} /></button>
              <button type="button" title="Duplicate" onClick={() => duplicateBlock(i)}><Icon name="copy" size={12} /></button>
              <button type="button" title="Delete" onClick={() => removeBlock(i)}><Icon name="trash2" size={12} /></button>
              {editing && !isPlaceholder && (
                <button type="button" title="Done editing this block" className="be-done-btn" onClick={() => setEditingId(null)}><Icon name="check" size={12} /></button>
              )}
            </div>
            <div className="be-block-body">
              {editing
                ? <>
                    <BlockContent block={block} components={components} componentBlocks={componentBlocks} isComponentDef={!allowComponents} forms={forms} experiments={experiments} onChange={props => updateBlock(i, props)} onSlash={() => setPickerAt(i)} />
                    <PersonalizeControl visibility={block.visibility} onChange={v => updateVisibility(i, v)} />
                  </>
                : <CollapsedBlock block={block} components={components} componentBlocks={componentBlocks} onClick={() => setEditingId(block.id)} />}
            </div>
            <div className="be-add-row">
              <button type="button" className="be-add-btn" onClick={() => setPickerAt(pickerAt === i ? null : i)}>
                <Icon name="plus" size={11} /> Add block
              </button>
              {pickerAt === i && (
                <div className="be-picker">
                  {blockOrder.map(t => (
                    <button key={t} type="button" onClick={() => insertBlock(i, t)}>
                      <span className="be-picker-glyph">{BLOCK_META[t].glyph}</span> {BLOCK_META[t].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The canvas's "at rest" view of one block — its real rendered form, via
 *  the exact same renderer the public site uses, so what you see while
 *  authoring is what a visitor will see. A 'component' block resolves to
 *  its real placed content when componentBlocks has it; otherwise (not
 *  fetched, or since deleted) falls back to a name chip rather than
 *  rendering nothing, since an empty canvas slot reads as a bug, not as
 *  "this is a component." An empty text block (nothing typed yet) shows a
 *  placeholder hint instead of a blank, un-clickable-looking gap. */
function CollapsedBlock({ block, components, componentBlocks, onClick }: {
  block: CmsBlock; components?: ComponentOption[]; componentBlocks?: Record<string, CmsBlock[]>; onClick: () => void;
}) {
  const p = block.props as any;
  const isEmptyText = ['paragraph', 'heading', 'quote'].includes(block.type) && !p.text;
  const isEmptyImage = block.type === 'image' && !p.url;
  const isEmptyButton = block.type === 'button' && !p.label && !p.url;
  const isEmptyEmbed = block.type === 'embed' && !p.url;

  if (block.type === 'component') {
    const resolved = componentBlocks?.[p.componentId];
    if (resolved) {
      const withOverrides = applyComponentOverrides(resolved, p.overrides);
      return (
        <div className="be-canvas-block" onClick={onClick}>
          {/* §34 — the placed component block itself (not its inner content
              below, which BlockPreview renders and badges on its own) can
              carry its own visibility rule, e.g. "hide this whole banner
              from returning visitors" — shown here since this branch calls
              BlockPreview on the component's resolved blocks, not on
              `block` itself, so the outer rule would otherwise never appear. */}
          {block.visibility && Object.keys(block.visibility).length > 0 && (
            <span className="block-preview-personalized-badge"><span aria-hidden="true">◎</span> {describeVisibility(block.visibility)}</span>
          )}
          <BlockPreview blocks={withOverrides} wrapClassName="be-canvas-inner" buttonClassName="be-canvas-btn" />
        </div>
      );
    }
    const name = components?.find(c => c.id === p.componentId)?.name;
    return (
      <div className="be-canvas-block be-canvas-chip" onClick={onClick}>
        <Icon name="copy" size={12} /> {name ? `Component: ${name}` : p.componentId ? 'Component (not found)' : 'Click to choose a component…'}
      </div>
    );
  }
  if (isEmptyText || isEmptyImage || isEmptyButton || isEmptyEmbed) {
    return <div className="be-canvas-block be-canvas-empty" onClick={onClick}>Click to edit this {BLOCK_META[block.type].label.toLowerCase()}…</div>;
  }
  // A divider has nothing to edit (BlockContent's own case is just the same
  // <hr>), so it never becomes clickable — the move/duplicate/delete rail is
  // still enough to manage it.
  if (block.type === 'divider') {
    return <BlockPreview blocks={[block]} wrapClassName="be-canvas-inner" buttonClassName="be-canvas-btn" />;
  }
  return <div className="be-canvas-block" onClick={onClick}><BlockPreview blocks={[block]} wrapClassName="be-canvas-inner" buttonClassName="be-canvas-btn" /></div>;
}

const VISITOR_TYPE_OPTIONS: { value: '' | 'new' | 'returning'; label: string }[] = [
  { value: '', label: 'Everyone' },
  { value: 'new', label: 'New visitors only' },
  { value: 'returning', label: 'Returning visitors only' },
];

/** §34 — a small, optional rules panel attached to any block: three real,
 *  browser-observable signals (new/returning via the same sticky
 *  localStorage marker §35's own experiments already use, a referrer
 *  substring, a utm_source substring) rather than a fabricated "audience"
 *  concept this codebase has no real segmentation data to back. Collapsed
 *  by default unless a rule is already set, so it stays out of the way for
 *  the overwhelming majority of blocks that don't need it. Never hides the
 *  block from THIS canvas — see BlockPreview.tsx's own evaluateBlockVisibility
 *  for where the rule is actually enforced (the real public site only). */
function PersonalizeControl({ visibility, onChange }: { visibility?: CmsBlockVisibility; onChange: (v: CmsBlockVisibility | undefined) => void }) {
  const hasRule = !!(visibility && (visibility.visitorType || visibility.referrerContains || visibility.utmSource));
  const [open, setOpen] = useState(hasRule);

  function set(patch: Partial<CmsBlockVisibility>) {
    const next: CmsBlockVisibility = { ...visibility, ...patch };
    (Object.keys(next) as (keyof CmsBlockVisibility)[]).forEach(k => { if (!next[k]) delete next[k]; });
    onChange(Object.keys(next).length ? next : undefined);
  }

  if (!open) {
    return (
      <button type="button" className="be-personalize-toggle" onClick={() => setOpen(true)}>
        <Icon name="target" size={11} /> Personalize (optional)
      </button>
    );
  }
  return (
    <div className="be-personalize">
      <div className="be-personalize-hdr">
        <span><Icon name="target" size={11} /> Personalize</span>
        <button type="button" onClick={() => { onChange(undefined); setOpen(false); }}>Remove</button>
      </div>
      <select className="be-select" value={visibility?.visitorType || ''} onChange={e => set({ visitorType: (e.target.value || undefined) as CmsBlockVisibility['visitorType'] })}>
        {VISITOR_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input className="be-input" placeholder="Only if referrer contains… (e.g. google)" value={visibility?.referrerContains || ''} onChange={e => set({ referrerContains: e.target.value })} />
      <input className="be-input" placeholder="Only if ?utm_source= contains… (e.g. newsletter)" value={visibility?.utmSource || ''} onChange={e => set({ utmSource: e.target.value })} />
      <p className="be-personalize-note">Evaluated on the real public site only — this canvas always shows the block so you can keep editing it.</p>
    </div>
  );
}

/** §6 — Bold/Italic buttons that wrap the textarea's own current selection
 *  in `**`/`_`, rendered as real <strong>/<em> at display time by
 *  BlockPreview.tsx's renderInlineFormatted — never a contentEditable field
 *  or stored HTML, so a paragraph/quote block's `text` stays exactly the
 *  plain string it always was (no backend change needed at all). Selection
 *  is read from the DOM node directly (a controlled textarea's `value` prop
 *  doesn't carry it), and restored via a pending-ref + effect after the new
 *  value round-trips back down as a prop — the same "re-focus once the DOM
 *  actually has the new value" shape RichTextEditor.tsx's own insertImage
 *  button already established for a similar restore-selection problem. */
function TextFormatToolbar({ textareaRef, value, onChange }: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  const pendingSelection = useRef<[number, number] | null>(null);
  const [rewriting, setRewriting] = useState(false);
  useEffect(() => {
    const sel = pendingSelection.current;
    const el = textareaRef.current;
    if (sel && el) {
      el.focus();
      el.setSelectionRange(sel[0], sel[1]);
      pendingSelection.current = null;
    }
  }, [value, textareaRef]);

  function wrap(marker: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`;
    pendingSelection.current = selected ? [start + marker.length, end + marker.length] : [start + marker.length, start + marker.length];
    onChange(next);
  }

  // §50 — "rewrite" sub-feature: replaces the whole block's text wholesale
  // (not an in-place wrap like Bold/Italic above), so there's no selection
  // to restore — it just needs the new value to actually land in the
  // textarea, which the controlled `value` prop already handles.
  async function rewrite() {
    if (!value.trim() || rewriting) return;
    setRewriting(true);
    try {
      const { result }: { result: string } = await apiFetch('/v1/cms/ai/rewrite', { method: 'POST', body: JSON.stringify({ text: value }) });
      onChange(result);
    } catch (e: any) {
      showAlert(`Couldn't rewrite this text: ${e.message}`);
    } finally {
      setRewriting(false);
    }
  }

  return (
    <div className="be-format-toolbar">
      <button type="button" title="Bold selected text" onMouseDown={e => e.preventDefault()} onClick={() => wrap('**')}><strong>B</strong></button>
      <button type="button" title="Italic selected text" onMouseDown={e => e.preventDefault()} onClick={() => wrap('_')}><em>i</em></button>
      <button type="button" title="Rewrite this text with AI" disabled={rewriting || !value.trim()} onClick={rewrite} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Icon name="sparkle" size={11} /> {rewriting ? 'Rewriting…' : 'Rewrite'}
      </button>
    </div>
  );
}

function BlockContent({ block, onChange, onSlash, components, componentBlocks, isComponentDef, forms, experiments }: {
  block: CmsBlock; onChange: (props: Record<string, unknown>) => void; onSlash: () => void; components?: ComponentOption[];
  componentBlocks?: Record<string, CmsBlock[]>;
  /** True while editing a component's own definition (BlockEditor's
   *  allowComponents=false) — the only context where marking a block with a
   *  reusable "slot" name makes sense (§8 variants). */
  isComponentDef?: boolean;
  forms?: { key: string; name: string }[];
  experiments?: { key: string; name: string }[];
}) {
  const p = block.props as any;
  const slashRef = useRef(false);
  const [altLoading, setAltLoading] = useState(false);
  const paragraphRef = useRef<HTMLTextAreaElement>(null);
  const quoteRef = useRef<HTMLTextAreaElement>(null);
  const slotField = isSlottableBlockType(block.type) && isComponentDef ? (
    <input className="be-input" style={{ fontSize: 11.5, marginTop: 6 }} placeholder="Slot name (optional) — lets each placement override this text, e.g. “headline”"
      value={p.slot || ''} onChange={e => onChange({ slot: e.target.value.trim() })} />
  ) : null;

  async function generateAltText(url: string) {
    setAltLoading(true);
    try {
      const result: { alt: string } = await apiFetch('/v1/cms/media/generate-alt-text', { method: 'POST', body: JSON.stringify({ url }) });
      onChange({ alt: result.alt });
    } catch (e: any) {
      showAlert(`Couldn't generate alt text: ${e.message}`);
    } finally {
      setAltLoading(false);
    }
  }

  switch (block.type) {
    case 'paragraph':
      return (
        <>
          <TextFormatToolbar textareaRef={paragraphRef} value={p.text || ''} onChange={v => onChange({ text: v })} />
          <textarea ref={paragraphRef} className="be-input be-text" rows={2} placeholder="Type “/” for block types, or just start writing…" value={p.text || ''} autoFocus
            onChange={e => {
              const v = e.target.value;
              // A real slash-command trigger: an empty paragraph that becomes
              // exactly "/" opens the same type picker the "+ Add block"
              // button does, instead of typing a literal slash character.
              if (v === '/' && !p.text) { onSlash(); slashRef.current = true; return; }
              onChange({ text: v });
            }} />
          {slotField}
        </>
      );
    case 'heading':
      return (
        <>
          <div className="be-heading-row">
            <select className="be-select" value={p.level ?? 2} onChange={e => onChange({ level: Number(e.target.value) })}>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
            <input className="be-input" autoFocus style={{ fontSize: p.level === 3 ? 17 : 20, fontWeight: 700 }} placeholder="Heading text" value={p.text || ''} onChange={e => onChange({ text: e.target.value })} />
          </div>
          {slotField}
        </>
      );
    case 'quote':
      return (
        <>
          <TextFormatToolbar textareaRef={quoteRef} value={p.text || ''} onChange={v => onChange({ text: v })} />
          <textarea ref={quoteRef} className="be-input be-quote" rows={2} placeholder="Quote text" value={p.text || ''} autoFocus onChange={e => onChange({ text: e.target.value })} />
          {slotField}
        </>
      );
    case 'image':
      return (
        <div className="be-stack">
          <input className="be-input" autoFocus placeholder="Image URL — pick one from Media in Customize, then paste it here" value={p.url || ''} onChange={e => onChange({ url: e.target.value })} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="be-input" style={{ flex: 1 }} placeholder="Alt text" value={p.alt || ''} onChange={e => onChange({ alt: e.target.value })} />
            {p.url && (
              <button type="button" className="be-add-btn" disabled={altLoading} title="Generate alt text with AI" onClick={() => generateAltText(p.url)} style={{ flexShrink: 0 }}>
                <Icon name="sparkle" size={11} /> {altLoading ? 'Generating…' : 'Generate'}
              </button>
            )}
          </div>
          {p.url && <img src={p.url} alt={p.alt || ''} className="be-image-preview" />}
          {slotField}
        </div>
      );
    case 'list': {
      const items: string[] = Array.isArray(p.items) ? p.items : [''];
      return (
        <div className="be-stack">
          <label className="be-checkbox"><input type="checkbox" checked={!!p.ordered} onChange={e => onChange({ ordered: e.target.checked })} /> Numbered</label>
          {items.map((item, idx) => (
            <div key={idx} className="be-list-row">
              <span className="be-list-marker">{p.ordered ? `${idx + 1}.` : '•'}</span>
              <input className="be-input" value={item} onChange={e => { const next = [...items]; next[idx] = e.target.value; onChange({ items: next }); }} />
              <button type="button" onClick={() => onChange({ items: items.filter((_, i2) => i2 !== idx) })}><Icon name="x" size={11} /></button>
            </div>
          ))}
          <button type="button" className="be-add-btn" onClick={() => onChange({ items: [...items, ''] })}><Icon name="plus" size={11} /> Add item</button>
        </div>
      );
    }
    case 'button':
      return (
        <div className="be-stack">
          <input className="be-input" autoFocus placeholder="Button label" value={p.label || ''} onChange={e => onChange({ label: e.target.value })} />
          <input className="be-input" placeholder="https://…" value={p.url || ''} onChange={e => onChange({ url: e.target.value })} />
          {slotField}
        </div>
      );
    case 'embed':
      return (
        <div className="be-stack">
          <input className="be-input" autoFocus placeholder="https://www.youtube.com/embed/… (YouTube, Vimeo, Google Maps/Calendar, Calendly, Spotify)" value={p.url || ''} onChange={e => onChange({ url: e.target.value })} />
          <input className="be-input" placeholder="Title (for accessibility — what is this embed?)" value={p.title || ''} onChange={e => onChange({ title: e.target.value })} />
        </div>
      );
    case 'divider':
      return <hr className="be-divider" />;
    // §30-31 — a form block is just a picker over the tenant's own forms
    // (CMS → Forms), by key — the canvas's own read-only view of the
    // chosen form (CollapsedBlock, once this returns to the collapsed
    // state) falls through to BlockPreview's own 'form' case, which
    // self-fetches the real field list and renders a genuine disabled
    // preview, not a name chip like 'component' needs here.
    case 'form': {
      const opts = forms ?? [];
      if (!opts.length) {
        return <div className="be-empty-hint">No forms yet — create one under CMS → Forms, then come back to place it here.</div>;
      }
      return (
        <select className="be-select" style={{ width: '100%' }} value={p.formKey || ''} onChange={e => onChange({ formKey: e.target.value })}>
          <option value="" disabled>Choose a form…</option>
          {opts.map(f => <option key={f.key} value={f.key}>{f.name}</option>)}
        </select>
      );
    }
    // §35 — an experiment block is just a picker over the tenant's own
    // experiments, by key — same shape as 'form' above. The canvas's own
    // read-only view (CollapsedBlock's BlockPreview fallback) shows
    // Variant A as a static preview once this returns to collapsed.
    case 'experiment': {
      const opts = experiments ?? [];
      if (!opts.length) {
        return <div className="be-empty-hint">No experiments yet — create one under CMS → Experiments, then come back to place it here.</div>;
      }
      return (
        <select className="be-select" style={{ width: '100%' }} value={p.experimentKey || ''} onChange={e => onChange({ experimentKey: e.target.value })}>
          <option value="" disabled>Choose an experiment…</option>
          {opts.map(x => <option key={x.key} value={x.key}>{x.name}</option>)}
        </select>
      );
    }
    case 'component': {
      const opts = components ?? [];
      if (!opts.length) {
        return <div className="be-empty-hint">No components yet — create one under CMS → Components, then come back to place it here.</div>;
      }
      // §8 — a placed component's own per-instance overrides. Slots come
      // from whatever blocks the *definition* tagged with a slot name (see
      // isComponentDef above) — nothing to show until the definition has at
      // least one, which is why this list can legitimately be empty even
      // for a component with real content.
      const slots = p.componentId ? listComponentSlots(componentBlocks?.[p.componentId] ?? []) : [];
      const overrides = (p.overrides ?? {}) as Record<string, string>;
      return (
        <div className="be-stack">
          <select className="be-select" style={{ width: '100%' }} value={p.componentId || ''} onChange={e => onChange({ componentId: e.target.value, overrides: {} })}>
            <option value="" disabled>Choose a component…</option>
            {opts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {slots.length > 0 && (
            <div className="be-stack" style={{ marginTop: 2 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Overrides for this placement</div>
              {slots.map(s => (
                <div key={s.slot}>
                  <input className="be-input" placeholder={s.defaultValue || s.slot}
                    value={overrides[s.slot] ?? ''}
                    onChange={e => onChange({ overrides: { ...overrides, [s.slot]: e.target.value } })} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}
