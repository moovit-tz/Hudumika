import React, { useState, useEffect } from 'react';
import type { CmsBlock, CmsBlockType, CmsBlockVisibility, CmsPublicForm, CmsPublicExperiment, CmsExperimentVariant } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';

// §8 — which prop a placed component's own "slot" override actually
// replaces, one per overridable block type. list/divider/component have no
// single obvious field to swap and are left out (a placement can still
// change which component/list content it uses by editing the shared
// definition itself — this is only about *per-placement* text variance,
// e.g. "same CTA banner, different headline on each of three landing pages").
const OVERRIDABLE_FIELD: Partial<Record<CmsBlockType, string>> = {
  paragraph: 'text', heading: 'text', quote: 'text', button: 'label', image: 'alt',
};

/** True for a block type a slot name can be attached to at all — used by
 *  the component definition editor (CMSComponents.tsx, via BlockEditor) to
 *  decide whether to show the "Slot name" field for a given block. */
export function isSlottableBlockType(type: CmsBlockType): boolean {
  return type in OVERRIDABLE_FIELD;
}

/** The real slots a component definition exposes — one per block that both
 *  carries a `props.slot` name and is an overridable type — each with the
 *  block's own current value as the "default," so a placement's override
 *  form can show what it's replacing. Used by BlockEditor.tsx's component
 *  placement UI to render one override input per slot. */
export function listComponentSlots(blocks: CmsBlock[]): { slot: string; type: CmsBlockType; label: string; defaultValue: string }[] {
  const out: { slot: string; type: CmsBlockType; label: string; defaultValue: string }[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const slot = (b.props as any)?.slot;
    const field = OVERRIDABLE_FIELD[b.type];
    if (!slot || typeof slot !== 'string' || !field || seen.has(slot)) continue;
    seen.add(slot);
    out.push({ slot, type: b.type, label: String((b.props as any)[field] ?? '') || slot, defaultValue: String((b.props as any)[field] ?? '') });
  }
  return out;
}

/** Merges a component block's own `props.overrides` (keyed by the slot name
 *  a block inside the component's *definition* was tagged with, via its own
 *  `props.slot`) into a fresh copy of that definition's blocks — never
 *  mutates `blocks` itself, since the same definition can be resolved by
 *  several different placements with different overrides in one render.
 *  An override key with no matching slot, or an empty string value, is
 *  simply ignored — the block keeps rendering its own real default. */
export function applyComponentOverrides(blocks: CmsBlock[], overrides?: unknown): CmsBlock[] {
  if (!overrides || typeof overrides !== 'object') return blocks;
  const map = overrides as Record<string, unknown>;
  return blocks.map(b => {
    const slot = (b.props as any)?.slot;
    const field = OVERRIDABLE_FIELD[b.type];
    if (!slot || !field || !(slot in map)) return b;
    const v = map[slot];
    if (typeof v !== 'string' || !v) return b;
    return { ...b, props: { ...b.props, [field]: v } };
  });
}

// §6 — a narrow inline-formatting scheme for the two "prose" block types
// (paragraph, quote): **bold** and _italic_, matching common lightweight-
// markdown convention (double-asterisk over single, to avoid the classic
// single-`*`-vs-multiplication-sign ambiguity). Deliberately NOT full
// markdown and NOT stored as HTML — a block's `text` stays the same plain
// string it always was (no backend change needed at all: sanitizeBlock's
// existing str() cap already covers it), so this is purely a render-time
// interpretation, same posture as the rest of this file. Scoped to
// paragraph/quote only — heading text is one short title, not "mid-sentence"
// prose, and button labels are shorter still; both stay plain for now.
export interface InlineToken { text: string; bold?: boolean; italic?: boolean }

/** Splits a string on non-nested **bold** and _italic_ spans. A marker with
 *  no closing pair (an unfinished "**" while someone is still typing) is
 *  left as literal text rather than swallowing the rest of the string —
 *  the regex only ever matches a *complete* pair. */
export function parseInlineFormatting(text: string): InlineToken[] {
  if (!text) return [];
  const tokens: InlineToken[] = [];
  const re = /\*\*(.+?)\*\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ text: m[1], bold: true });
    else tokens.push({ text: m[2], italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}

/** Renders parseInlineFormatting's tokens as real <strong>/<em>, plain React
 *  text elsewhere — never dangerouslySetInnerHTML, so React's own escaping
 *  still covers every token's text exactly as it already did for the whole
 *  unformatted string. */
export function renderInlineFormatted(text: string): React.ReactNode {
  return parseInlineFormatting(text).map((t, i) => {
    if (t.bold) return <strong key={i}>{t.text}</strong>;
    if (t.italic) return <em key={i}>{t.text}</em>;
    return t.text;
  });
}

/** §30-31 — one control per CmsFormFieldType, shared by both the real
 *  (interactive, submittable) and preview (disabled) render paths below so
 *  the two can never drift into showing different field shapes. */
function renderFormField(f: { key: string; label: string; type: string; required?: boolean; options?: string[] }, value: string, onChange: (v: string) => void, disabled: boolean) {
  const common = { required: f.required, disabled, value, onChange: (e: React.ChangeEvent<any>) => onChange(e.target.value) };
  if (f.type === 'textarea') return <textarea {...common} rows={4} />;
  if (f.type === 'select') {
    return (
      <select {...common}>
        <option value="">Choose…</option>
        {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return <input {...common} type={f.type === 'email' ? 'email' : 'text'} />;
}

/** §30-31 — a form block self-fetches its own public shape by `formKey`
 *  (see sanitizeBlock's own comment on why forms are self-fetching rather
 *  than server-pre-resolved like a 'component' block) and, only when
 *  `interactive` is true (OneSitePublic.tsx, the real public site — never
 *  the admin canvas/preview, where a real submission from clicking around
 *  while editing would be a confusing false positive), actually accepts
 *  and posts a real submission. The admin's own render is a disabled
 *  preview of the same fields instead, so "what will visitors see" is
 *  still honestly shown without risking a fake row in someone's inbox. */
function FormBlockRenderer({ formKey, tenantSlug, interactive, buttonClassName }: { formKey: string; tenantSlug?: string; interactive?: boolean; buttonClassName: string }) {
  const [form, setForm] = useState<CmsPublicForm | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setLoaded(false);
    if (!tenantSlug || !formKey) { setForm(null); setLoaded(true); return; }
    let cancelled = false;
    apiFetch(`/v1/cms/public/${tenantSlug}/forms/${formKey}`)
      .then((f: CmsPublicForm) => { if (!cancelled) { setForm(f); setLoaded(true); } })
      .catch(() => { if (!cancelled) { setForm(null); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [tenantSlug, formKey]);

  if (!loaded || !form) return null; // still loading, or a deleted/orphaned reference — resolved gracefully, same posture a since-deleted 'component' block already takes

  if (!interactive) {
    return (
      <form className="block-preview-form block-preview-form-static">
        <p className="block-preview-form-label-note">{form.name} — preview only, live on the public site</p>
        {form.fields.map(f => (
          <label key={f.key} className="block-preview-form-field">
            <span>{f.label}{f.required ? ' *' : ''}</span>
            {renderFormField(f, '', () => {}, true)}
          </label>
        ))}
      </form>
    );
  }

  if (status === 'done') {
    return <p className="block-preview-form-success">{form.success_message || 'Thanks — your submission was received.'}</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting'); setErrorMsg('');
    try {
      await apiFetch(`/v1/cms/public/${tenantSlug}/forms/${formKey}/submit`, { method: 'POST', body: JSON.stringify(values) });
      setStatus('done');
    } catch (err: any) {
      setStatus('error'); setErrorMsg(err.message || 'Something went wrong — please try again.');
    }
  }

  return (
    <form className="block-preview-form" onSubmit={handleSubmit}>
      {form.fields.map(f => (
        <label key={f.key} className="block-preview-form-field">
          <span>{f.label}{f.required ? ' *' : ''}</span>
          {renderFormField(f, values[f.key] || '', v => setValues(vs => ({ ...vs, [f.key]: v })), false)}
        </label>
      ))}
      {/* Honeypot — CSS-hidden, never shown to a real visitor. A form's own
          real fields can never collide with this key: cms-forms.service.ts
          only ever reads/stores fields it finds in the form's own declared
          config, and "_hp" isn't a shape any admin-authored field key can
          land on by accident (keyOf() never produces a leading underscore). */}
      <input type="text" value={values._hp || ''} onChange={e => setValues(v => ({ ...v, _hp: e.target.value }))}
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
      {status === 'error' && <p className="block-preview-form-error">{errorMsg}</p>}
      <button type="submit" className={buttonClassName} disabled={status === 'submitting'}>{status === 'submitting' ? 'Sending…' : 'Submit'}</button>
    </form>
  );
}

/** §35 — which variant a *this browser* sees, sticky across visits via
 *  localStorage (a real per-visitor identity would need a cookie/session
 *  this public site deliberately has none of — see §33's own "no
 *  per-visitor identity" framing). A brand-new visitor is assigned
 *  uniformly at random and the choice is persisted; wrapped in try/catch
 *  since localStorage can throw in a private window or with blocked site
 *  data, in which case every render just re-randomizes rather than
 *  crashing the page. */
function assignExperimentVariant(key: string): CmsExperimentVariant {
  const storageKey = `hud_exp_${key}`;
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing === 'a' || existing === 'b') return existing;
    const chosen: CmsExperimentVariant = Math.random() < 0.5 ? 'a' : 'b';
    localStorage.setItem(storageKey, chosen);
    return chosen;
  } catch {
    return Math.random() < 0.5 ? 'a' : 'b';
  }
}

/** §35 — an experiment block self-fetches both variants' own blocks by
 *  `experimentKey` (same self-fetching-by-key reasoning as 'form' above),
 *  and — only when `interactive` — assigns this visitor to one, renders
 *  it via a nested BlockPreview, and records one real view for it. The
 *  admin's own render is a static, disabled preview of Variant A with a
 *  label, so clicking around while editing can never inflate a real
 *  variant's own view count — the same reasoning FormBlockRenderer's own
 *  interactive gate already uses. */
function ExperimentBlockRenderer({ experimentKey, tenantSlug, interactive, components, wrapClassName, buttonClassName, visitorSegment }: {
  experimentKey: string; tenantSlug?: string; interactive?: boolean; components?: Record<string, CmsBlock[]>; wrapClassName: string; buttonClassName: string; visitorSegment?: VisitorSegment;
}) {
  const [experiment, setExperiment] = useState<CmsPublicExperiment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [variant] = useState<CmsExperimentVariant>(() => (interactive ? assignExperimentVariant(experimentKey) : 'a'));

  useEffect(() => {
    setLoaded(false);
    if (!tenantSlug || !experimentKey) { setExperiment(null); setLoaded(true); return; }
    let cancelled = false;
    apiFetch(`/v1/cms/public/${tenantSlug}/experiments/${experimentKey}`)
      .then((e: CmsPublicExperiment) => { if (!cancelled) { setExperiment(e); setLoaded(true); } })
      .catch(() => { if (!cancelled) { setExperiment(null); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [tenantSlug, experimentKey]);

  // Records one view for the assigned variant, once, only on the real
  // public site, and only while the experiment is actually still running
  // — a stopped experiment still renders (Variant A, the presumed "kept"
  // one) but stops accumulating counts either variant never asked for.
  useEffect(() => {
    if (!interactive || !tenantSlug || !experiment || experiment.status !== 'running') return;
    apiFetch(`/v1/cms/public/${tenantSlug}/experiments/${experimentKey}/view`, { method: 'POST', body: JSON.stringify({ variant }) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, tenantSlug, experiment?.id, experiment?.status]);

  if (!loaded || !experiment) return null; // still loading, or a deleted/orphaned reference — resolved gracefully, same posture 'form'/'component' already take

  const activeVariant = experiment.status === 'running' ? variant : 'a';
  const blocks = activeVariant === 'a' ? experiment.variant_a_blocks : experiment.variant_b_blocks;

  if (!interactive) {
    return (
      <div className="block-preview-experiment-static">
        <p className="block-preview-form-label-note">Experiment — Variant A shown here; visitors are split evenly between two variants on the public site.</p>
        <BlockPreview blocks={blocks} components={components} wrapClassName={wrapClassName} buttonClassName={buttonClassName} />
      </div>
    );
  }
  return <BlockPreview blocks={blocks} components={components} wrapClassName={wrapClassName} buttonClassName={buttonClassName} tenantSlug={tenantSlug} interactive visitorSegment={visitorSegment} />;
}

// §34 — Personalization: a real, bounded rules layer over the block
// renderer, evaluated ONLY on the real public site (interactive=true) —
// never the admin canvas/preview, which always renders every block
// (so an author can still see and edit whatever a rule would otherwise
// hide there) and instead shows a small disclosure badge naming the rule.
// Three real, browser-observable signals — not a fabricated "audience"
// concept this codebase has no real segmentation data to back: which
// localStorage-tracked visitor bucket this browser is in (new vs.
// returning — the same sticky-assignment mechanism §35's own experiments
// already use), a substring of document.referrer, and a substring of the
// ?utm_source= query param. Every condition actually set on a block must
// pass (AND) for it to render.
export interface VisitorSegment {
  isNewVisitor: boolean;
  referrer: string;
  utmSource: string;
}

const DEFAULT_VISITOR_SEGMENT: VisitorSegment = { isNewVisitor: true, referrer: '', utmSource: '' };

/** Pure — no DOM access — so it's testable the same direct way
 *  applyComponentOverrides/renderInlineFormatted above already are. */
export function evaluateBlockVisibility(visibility: CmsBlockVisibility | undefined, segment: VisitorSegment): boolean {
  if (!visibility) return true;
  if (visibility.visitorType === 'new' && !segment.isNewVisitor) return false;
  if (visibility.visitorType === 'returning' && segment.isNewVisitor) return false;
  if (visibility.referrerContains && !segment.referrer.toLowerCase().includes(visibility.referrerContains.toLowerCase())) return false;
  if (visibility.utmSource && !segment.utmSource.toLowerCase().includes(visibility.utmSource.toLowerCase())) return false;
  return true;
}

/** A short, human-readable summary of a visibility rule — shared by the
 *  admin canvas's disclosure badge (below) and BlockEditor.tsx's own
 *  Personalize control, so the two can never drift into describing the
 *  same rule two different ways. */
export function describeVisibility(v: CmsBlockVisibility): string {
  const parts: string[] = [];
  if (v.visitorType === 'new') parts.push('new visitors');
  else if (v.visitorType === 'returning') parts.push('returning visitors');
  if (v.referrerContains) parts.push(`referrer has "${v.referrerContains}"`);
  if (v.utmSource) parts.push(`utm_source has "${v.utmSource}"`);
  return parts.length ? `Shown only to: ${parts.join(', ')}` : 'Personalized';
}

/** Computed once per real page view — the sole call site is
 *  OneSitePublic.tsx's BlockList, the only place `interactive` is ever
 *  true — and threaded down through every nested BlockPreview call on
 *  that page (a placed 'component' or 'experiment' block's own inner
 *  blocks), never recomputed per block. The new-vs-returning flag this
 *  sets in localStorage is a one-time "have I been here before" marker
 *  for the whole page view, not a per-block one — calling this more than
 *  once per page would flip a genuinely new visitor to "returning"
 *  partway through their own first block. Wrapped in try/catch the same
 *  way §35's own assignExperimentVariant already is, for private
 *  browsing / blocked site data — falls back to "new," a real, disclosed
 *  narrowing rather than a crash. */
export function getVisitorSegment(): VisitorSegment {
  const referrer = typeof document !== 'undefined' ? document.referrer || '' : '';
  const utmSource = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('utm_source') || '' : '';
  let isNewVisitor = true;
  try {
    if (localStorage.getItem('hud_visitor_seen')) isNewVisitor = false;
    else localStorage.setItem('hud_visitor_seen', '1');
  } catch {
    // storage unavailable — every render this session then just treats the visit as "new"
  }
  return { isNewVisitor, referrer, utmSource };
}

/**
 * Renders a block array as real semantic HTML — never dangerouslySetInnerHTML,
 * block text props are plain strings so a React text node is both simpler
 * and safer than building HTML from them (same reasoning as the original,
 * OneSitePublic-only BlockList this was extracted from).
 *
 * The one function that decides what a block array actually looks like,
 * shared by both the real public site (OneSitePublic.tsx) and the admin
 * editor's live preview (CMSContentEntries.tsx / CMSComponents.tsx) — so a
 * preview can never silently drift from what a visitor actually sees, which
 * a second, hand-maintained rendering switch in the editor could do over
 * time. `wrapClassName`/`buttonClassName` let each context keep its own
 * CSS/tokens (the public site's `--lp-*` palette vs. the admin app's own)
 * while the actual rendering behavior — including 'component' block
 * resolution — stays identical everywhere.
 */
export function BlockPreview({ blocks, components, wrapClassName = 'block-preview', buttonClassName = 'block-preview-btn', tenantSlug, interactive, visitorSegment }: {
  blocks: CmsBlock[];
  /** Resolved 'component' block content, keyed by component id — see cms-content.service.ts's getPublicEntry for how the public route builds this, and CMSContentEntries.tsx for how the admin editor builds it from the components it already fetched. */
  components?: Record<string, CmsBlock[]>;
  wrapClassName?: string;
  buttonClassName?: string;
  /** §30-31 — required for a 'form' block to render at all (it self-fetches
   *  GET /v1/cms/public/:tenantSlug/forms/:formKey); omitted in contexts
   *  with no real tenant site to resolve against. */
  tenantSlug?: string;
  /** §30-31 — true only on the real public site: a 'form' block becomes a
   *  genuinely submittable form rather than a disabled preview of the same
   *  fields. Defaults to false so every existing admin canvas/preview call
   *  site keeps rendering read-only without having to opt in explicitly. */
  interactive?: boolean;
  /** §34 — this page view's real visitor segment (see getVisitorSegment),
   *  computed once by the sole `interactive` caller (OneSitePublic.tsx) and
   *  threaded through every nested call unchanged. Only ever consulted when
   *  `interactive` is true — the admin canvas/preview never filters a block
   *  out, so it never needs a real segment to check against. */
  visitorSegment?: VisitorSegment;
}) {
  return (
    <div className={wrapClassName}>
      {blocks.map(b => {
        const p = b.props as any;
        if (interactive && !evaluateBlockVisibility(b.visibility, visitorSegment ?? DEFAULT_VISITOR_SEGMENT)) return null;
        const body = (() => {
          switch (b.type) {
            case 'paragraph': return p.text ? <p>{renderInlineFormatted(p.text)}</p> : null;
            case 'heading': return p.level === 3 ? <h3>{p.text}</h3> : <h2>{p.text}</h2>;
            case 'quote': return <blockquote>{renderInlineFormatted(p.text)}</blockquote>;
            case 'image': return p.url ? <img src={p.url} alt={p.alt || ''} style={{ maxWidth: '100%', borderRadius: 8 }} /> : null;
            case 'form': return p.formKey ? <FormBlockRenderer formKey={p.formKey} tenantSlug={tenantSlug} interactive={interactive} buttonClassName={buttonClassName} /> : null;
            case 'experiment': return p.experimentKey ? <ExperimentBlockRenderer experimentKey={p.experimentKey} tenantSlug={tenantSlug} interactive={interactive} components={components} wrapClassName={wrapClassName} buttonClassName={buttonClassName} visitorSegment={visitorSegment} /> : null;
            case 'list': {
              const items: string[] = Array.isArray(p.items) ? p.items : [];
              const Tag = p.ordered ? 'ol' : 'ul';
              return <Tag>{items.map((it, i) => <li key={i}>{it}</li>)}</Tag>;
            }
            case 'button': return p.url ? <a href={p.url} className={buttonClassName} target="_blank" rel="noopener noreferrer">{p.label || p.url}</a> : null;
            case 'divider': return <hr />;
            case 'component': {
              const inner = components?.[p.componentId];
              if (!inner) return null;
              const resolved = applyComponentOverrides(inner, p.overrides);
              return <BlockPreview blocks={resolved} components={components} wrapClassName={wrapClassName} buttonClassName={buttonClassName} tenantSlug={tenantSlug} interactive={interactive} visitorSegment={visitorSegment} />;
            }
            default: return null;
          }
        })();
        if (body === null) return null;
        // §34 — the admin canvas/preview never hides a personalized block
        // (only the real public site does, via the visibility check above),
        // but it does disclose the rule right on the block, so an author
        // never mistakes "personalized" for "broken."
        if (!interactive && b.visibility && Object.keys(b.visibility).length > 0) {
          return (
            <div key={b.id} className="block-preview-personalized">
              <span className="block-preview-personalized-badge"><span aria-hidden="true">◎</span> {describeVisibility(b.visibility)}</span>
              {body}
            </div>
          );
        }
        return <React.Fragment key={b.id}>{body}</React.Fragment>;
      })}
    </div>
  );
}
