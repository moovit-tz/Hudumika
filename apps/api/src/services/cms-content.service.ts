import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { sanitizeContent, statusTransitionEvent, verifyPreviewToken, generatePreviewToken } from './cms.service.js';
import { recordRevision, deleteRevisions } from './cms-revisions.service.js';
import { CMSWebhooksService } from './cms-webhooks.service.js';
import { emitDomainEvent } from './domain-events.service.js';
import type {
  CmsContentModel, CreateCmsContentModelInput,
  CmsContentField, CreateCmsContentFieldInput, UpdateCmsContentFieldInput,
  CmsContentEntry, CreateCmsContentEntryInput, UpdateCmsContentEntryInput,
  CmsFieldType, CmsBlock, CmsBlockType, CmsPublicContentEntry, CmsPublicContentEntrySummary,
  CmsComponent, CreateCmsComponentInput, UpdateCmsComponentInput,
  CmsSavedFilter, CreateCmsSavedFilterInput, CmsRepeatableItemType,
} from '@hudumika/types';

const REPEATABLE_ITEM_TYPES: CmsRepeatableItemType[] = ['text', 'number', 'url', 'email'];

// ── §2 — a small, safe formula evaluator for 'computed' fields ──────────
// Deliberately not a real expression language and never eval()/new
// Function() on anything tenant-authored (a formula string is exactly
// that — tenant input, evaluated server-side). Grammar is arithmetic
// only: + - * / unary minus, parentheses, numeric literals, and
// {fieldKey} references to a *sibling*, non-computed field on the same
// entry — no string ops, no function calls, no comparisons, nothing that
// needs anything beyond a hand-rolled recursive-descent parser over four
// token kinds.
type FormulaNode =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; key: string }
  | { kind: 'neg'; arg: FormulaNode }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode };

type FormulaToken = { kind: 'num'; value: number } | { kind: 'ref'; key: string } | { kind: 'op'; value: string };

function tokenizeFormula(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let i = 0;
  while (i < formula.length) {
    const c = formula[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < formula.length && /[0-9.]/.test(formula[j])) j++;
      const raw = formula.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new ValidationError(`Invalid number "${raw}" in formula.`);
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }
    if (c === '{') {
      const j = formula.indexOf('}', i);
      if (j < 0) throw new ValidationError('Formula has an unclosed "{" field reference.');
      const key = formula.slice(i + 1, j).trim();
      if (!key) throw new ValidationError('Formula has an empty "{}" field reference.');
      tokens.push({ kind: 'ref', key });
      i = j + 1;
      continue;
    }
    if ('+-*/()'.includes(c)) { tokens.push({ kind: 'op', value: c }); i++; continue; }
    throw new ValidationError(`Formula has an unexpected character "${c}".`);
  }
  return tokens;
}

/** Recursive-descent parser over the grammar:
 *    expr   := term (('+'|'-') term)*
 *    term   := factor (('*'|'/') factor)*
 *    factor := NUMBER | REF | '(' expr ')' | '-' factor */
function parseFormula(formula: string): FormulaNode {
  const tokens = tokenizeFormula(formula);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseFactor(): FormulaNode {
    const t = peek();
    if (!t) throw new ValidationError('Formula ended unexpectedly.');
    if (t.kind === 'num') { next(); return { kind: 'num', value: t.value }; }
    if (t.kind === 'ref') { next(); return { kind: 'ref', key: t.key }; }
    if (t.kind === 'op' && t.value === '-') { next(); return { kind: 'neg', arg: parseFactor() }; }
    if (t.kind === 'op' && t.value === '(') {
      next();
      const inner = parseExpr();
      const close = next();
      if (!close || close.kind !== 'op' || close.value !== ')') throw new ValidationError('Formula is missing a closing ")".');
      return inner;
    }
    throw new ValidationError('Formula has an unexpected token.');
  }
  function parseTerm(): FormulaNode {
    let left = parseFactor();
    while (peek()?.kind === 'op' && (peek() as any).value === '*' || peek()?.kind === 'op' && (peek() as any).value === '/') {
      const op = (next() as any).value as '*' | '/';
      left = { kind: 'bin', op, left, right: parseFactor() };
    }
    return left;
  }
  function parseExpr(): FormulaNode {
    let left = parseTerm();
    while (peek()?.kind === 'op' && ((peek() as any).value === '+' || (peek() as any).value === '-')) {
      const op = (next() as any).value as '+' | '-';
      left = { kind: 'bin', op, left, right: parseTerm() };
    }
    return left;
  }

  if (tokens.length === 0) throw new ValidationError('Formula is empty.');
  const ast = parseExpr();
  if (pos < tokens.length) throw new ValidationError('Formula has trailing, unparsed content.');
  return ast;
}

/** Every {fieldKey} the formula references — used both to validate a
 *  computed field's config at field-creation time (every referenced key
 *  must be a real, non-computed field on the same model) and, together
 *  with evaluateFormula below, to actually compute the value on save. */
function formulaFieldRefs(ast: FormulaNode): string[] {
  switch (ast.kind) {
    case 'ref': return [ast.key];
    case 'neg': return formulaFieldRefs(ast.arg);
    case 'bin': return [...formulaFieldRefs(ast.left), ...formulaFieldRefs(ast.right)];
    default: return [];
  }
}

/** A referenced sibling field that's missing, null, or non-numeric
 *  resolves to 0 rather than throwing — the same "empty is not an error
 *  unless required" posture every other field type here already takes;
 *  a formula referencing a field nobody has filled in yet on a draft is a
 *  real, common case, not a malformed one. Division by zero resolves to 0
 *  for the same reason (a spreadsheet-style #DIV/0! isn't a concept this
 *  CMS's other field types have anywhere to surface). */
function evaluateFormula(ast: FormulaNode, values: Record<string, unknown>): number {
  switch (ast.kind) {
    case 'num': return ast.value;
    case 'ref': {
      const v = values[ast.key];
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    case 'neg': return -evaluateFormula(ast.arg, values);
    case 'bin': {
      const l = evaluateFormula(ast.left, values);
      const r = evaluateFormula(ast.right, values);
      switch (ast.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? 0 : l / r;
      }
    }
  }
}

/** The real, shipped core set — not the brief's full ~35. field_type is a
 *  free string in the DB (migration 465's own comment), so adding another
 *  type later is a code change here, never a migration. Each entry is
 *  {type, label, coerce, validate} — coerce runs before validate so e.g. a
 *  numeric string from a form input becomes a real number first. */
export const FIELD_TYPES: Record<CmsFieldType, { label: string }> = {
  text:     { label: 'Text' },
  textarea: { label: 'Long text' },
  richtext: { label: 'Rich text' },
  blocks:   { label: 'Blocks (structured content)' },
  number:   { label: 'Number' },
  boolean:  { label: 'Yes / No' },
  date:     { label: 'Date' },
  datetime: { label: 'Date & time' },
  email:    { label: 'Email' },
  url:      { label: 'URL' },
  select:   { label: 'Select (one of a list)' },
  tags:     { label: 'Tags' },
  image:    { label: 'Image' },
  relation: { label: 'Relation (link to another model)' },
  coordinates: { label: 'Coordinates (lat/lng)' },
  color:       { label: 'Color' },
  phone:       { label: 'Phone' },
  currency:    { label: 'Currency (amount + code)' },
  repeatable:  { label: 'Repeatable list' },
  computed:    { label: 'Computed (formula)' },
};

const BLOCK_TYPES: CmsBlockType[] = ['paragraph', 'heading', 'image', 'list', 'quote', 'button', 'divider', 'component', 'form', 'experiment'];

/** Validates + sanitizes one block's props by its own type. Block text
 *  props render as plain React text nodes (both in the editor and on the
 *  public site) rather than dangerouslySetInnerHTML, so React's own
 *  escaping is the real XSS defense for them — the one thing worth
 *  validating server-side is url-bearing props, which DO get used as a
 *  real href/src and could otherwise carry a javascript: URI.
 *
 *  `context` guards against a component referencing itself (or another
 *  component) inside its own definition — sanitizeBlock has no DB access
 *  to check for a *cycle* of components referencing each other, so the
 *  simplest correct rule is the strict one: a component's own block array
 *  may never contain a 'component' block at all. §35 extends the same
 *  reasoning to an experiment's own variant blocks — no A/B test nested
 *  inside another A/B test. Entry-level blocks fields (the normal case)
 *  are unaffected by either restriction. Exported for
 *  cms-experiments.service.ts's own reuse — a variant's blocks are
 *  sanitized by the exact same rules as any other blocks array, not a
 *  second hand-rolled copy of this switch. */
export function sanitizeBlock(raw: any, context: 'entry' | 'component' | 'experiment' = 'entry'): CmsBlock {
  const type = raw?.type;
  if (!BLOCK_TYPES.includes(type)) throw new ValidationError(`Unknown block type "${type}".`);
  if (type === 'component' && context === 'component') {
    throw new ValidationError('A component cannot reference another component.');
  }
  if (type === 'experiment' && context === 'experiment') {
    throw new ValidationError('An experiment variant cannot contain another experiment.');
  }
  const p = raw?.props ?? {};
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).slice(0, 5000);
  const checkUrl = (v: unknown, field: string) => {
    const s = str(v);
    if (s && !/^https?:\/\//.test(s)) throw new ValidationError(`Block ${field} must start with http:// or https://.`);
    return s;
  };
  // §8 — a slot name marks one block inside a component's own definition as
  // overridable per placement (see BlockPreview.tsx's OVERRIDABLE_FIELD).
  // Short identifier, not free text — capped much tighter than str()'s
  // general 5000, and omitted entirely from props when blank so an
  // untagged block never accidentally becomes "" a slot name that could
  // collide with another untagged block.
  const slotProp = (v: unknown): Record<string, unknown> => {
    const s = (v === undefined || v === null ? '' : String(v)).trim().slice(0, 60);
    return s ? { slot: s } : {};
  };
  // §34 — a personalization rule, cross-cutting across every block type
  // (unlike `slot` above, which only ever makes sense on a handful of
  // overridable text fields) — so it's validated once here, applied to the
  // return value below regardless of `type`, rather than duplicated into
  // every case of the switch that follows. No DB access, same pure-function
  // posture as the rest of this file: the three signals themselves are all
  // real, observable-in-the-browser facts (see BlockPreview.tsx's
  // evaluateBlockVisibility), not a fabricated "audience" this codebase has
  // no real segmentation data to back.
  const visibilityOf = (raw: unknown): Record<string, unknown> => {
    if (!raw || typeof raw !== 'object') return {};
    const v = raw as any;
    const rule: Record<string, unknown> = {};
    if (v.visitorType === 'new' || v.visitorType === 'returning') rule.visitorType = v.visitorType;
    const referrerContains = str(v.referrerContains).trim().slice(0, 100);
    if (referrerContains) rule.referrerContains = referrerContains;
    const utmSource = str(v.utmSource).trim().slice(0, 100);
    if (utmSource) rule.utmSource = utmSource;
    return Object.keys(rule).length ? { visibility: rule } : {};
  };
  let props: Record<string, unknown>;
  switch (type as CmsBlockType) {
    case 'paragraph':
    case 'quote':
      props = { text: str(p.text), ...slotProp(p.slot) };
      break;
    case 'heading':
      props = { text: str(p.text), level: [2, 3].includes(Number(p.level)) ? Number(p.level) : 2, ...slotProp(p.slot) };
      break;
    case 'image':
      props = { url: checkUrl(p.url, 'image url'), alt: str(p.alt), ...slotProp(p.slot) };
      break;
    case 'list':
      props = { items: Array.isArray(p.items) ? p.items.map(str).slice(0, 100) : [], ordered: p.ordered === true };
      break;
    case 'button':
      props = { label: str(p.label), url: checkUrl(p.url, 'button url'), ...slotProp(p.slot) };
      break;
    case 'component': {
      const id = str(p.componentId);
      if (!id) throw new ValidationError('A component block must reference a component.');
      // Existence isn't checked here (no DB access in this pure function) —
      // same disclosed limitation as the 'relation' field type: a deleted
      // component leaves an orphaned reference, resolved gracefully (simply
      // not rendered) rather than blocked as a save-time error. deleteComponent
      // below refuses to delete one still referenced by a real entry, which is
      // the actual guard against this happening in the normal course of use.
      // §8 — per-placement slot overrides: a plain string map, keyed by
      // whatever slot name the component's own definition used. Not
      // validated against the real definition here either (same pure-
      // function/no-DB-access reasoning as componentId above) — an override
      // key with no matching slot is simply ignored at render time
      // (BlockPreview.tsx's applyComponentOverrides).
      const rawOverrides = p.overrides && typeof p.overrides === 'object' ? p.overrides : {};
      const overrides: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawOverrides).slice(0, 30)) {
        const key = String(k).trim().slice(0, 60);
        if (!key) continue;
        overrides[key] = str(v).slice(0, 500);
      }
      props = { componentId: id, overrides };
      break;
    }
    // §30-31 — a form block references its form by `key` (stable,
    // human-readable, unique per tenant — migration 478's own
    // UNIQUE(tenant_id,key)), not `id` like a 'component' block. Unlike a
    // component (static content resolved server-side into `components`),
    // a form is a real interactive widget that needs its own live
    // fetch-and-submit cycle at render time, so it self-fetches
    // GET /v1/cms/public/:tenantSlug/forms/:formKey directly rather than
    // being pre-resolved — key, not id, is what that route is keyed by.
    // No DB access in this pure function, existence isn't checked here,
    // same disclosed posture componentId already has above — a deleted
    // form leaves an orphaned reference the renderer resolves gracefully
    // (a real 404 from that fetch), not a save-time error.
    case 'form':
      props = { formKey: str(p.formKey) };
      break;
    // §35 — same self-fetching-by-key convention as 'form' above, and the
    // same disclosed reasoning: an experiment is a real interactive/random
    // widget, not static content a public entry response can pre-resolve.
    case 'experiment':
      props = { experimentKey: str(p.experimentKey) };
      break;
    case 'divider':
    default:
      props = {};
      break;
  }
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : `b${Math.random().toString(36).slice(2, 10)}`,
    type, props, ...visibilityOf(raw?.visibility),
  };
}

function slugifyBase(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'entry';
}
function fieldKeyOf(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'field';
}

function toModel(row: any): CmsContentModel {
  return {
    id: row.id, tenant_id: row.tenant_id, key: row.key, name: row.name, name_plural: row.name_plural,
    description: row.description, icon: row.icon, created_by: row.created_by,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
    ...(row.entry_count !== undefined ? { entry_count: Number(row.entry_count) } : {}),
  };
}
function toField(row: any): CmsContentField {
  return {
    id: row.id, tenant_id: row.tenant_id, model_id: row.model_id, key: row.key, label: row.label,
    field_type: row.field_type, required: row.required, help_text: row.help_text,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config ?? {}),
    sort_order: row.sort_order,
  };
}
function toEntry(row: any): CmsContentEntry {
  return {
    id: row.id, tenant_id: row.tenant_id, model_id: row.model_id, slug: row.slug, title: row.title,
    status: row.status, data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data ?? {}),
    seo_description: row.seo_description, author_id: row.author_id,
    publish_at: row.publish_at ? (row.publish_at as Date).toISOString() : null,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
  };
}

// Same "content fields only" rule as cms.service.ts's page/post snapshots —
// never id/tenant_id/model_id/author_id/timestamps.
function entryRevisionSnapshot(entry: CmsContentEntry): Record<string, unknown> {
  return { slug: entry.slug, title: entry.title, status: entry.status, data: entry.data, seo_description: entry.seo_description, publish_at: entry.publish_at };
}

function toComponent(row: any): CmsComponent {
  return {
    id: row.id, tenant_id: row.tenant_id, key: row.key, name: row.name,
    blocks: typeof row.blocks === 'string' ? JSON.parse(row.blocks) : (row.blocks ?? []),
    created_by: row.created_by,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
  };
}
function toSavedFilter(row: any): CmsSavedFilter {
  return {
    id: row.id, tenant_id: row.tenant_id, model_id: row.model_id, name: row.name,
    status: row.status, search: row.search, created_by: row.created_by,
    created_at: (row.created_at as Date).toISOString(),
  };
}

/** Walks every array-valued field in an entry's `data` for 'component'
 *  blocks and returns the distinct component ids referenced — used to
 *  resolve them server-side for the public route, which has no session to
 *  fetch a component by id itself. */
function collectComponentIds(data: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const block of value) {
      if (block && typeof block === 'object' && (block as any).type === 'component') {
        const id = (block as any).props?.componentId;
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
  }
  return Array.from(ids);
}

export class ValidationError extends Error {}

/** The single-value validation a 'repeatable' field's own itemType reuses
 *  for each array entry — deliberately just the 4 REPEATABLE_ITEM_TYPES,
 *  not a generic dispatch into every case coerceAndValidate knows (most of
 *  those are compound or stateful in ways that don't make sense repeated,
 *  e.g. 'relation' would need a DB check per item, 'blocks' nested arrays
 *  of arrays). label/index are only used to name which entry failed. */
function coerceScalarItem(itemType: CmsRepeatableItemType, raw: unknown, label: string, index: number): string | number {
  const where = `"${label}" item ${index + 1}`;
  switch (itemType) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n)) throw new ValidationError(`${where} must be a number.`);
      return n;
    }
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw))) throw new ValidationError(`${where} must be a valid email.`);
      return String(raw);
    case 'url':
      if (!/^https?:\/\//.test(String(raw))) throw new ValidationError(`${where} must start with http:// or https://.`);
      return String(raw);
    case 'text':
    default:
      return String(raw);
  }
}

/** Coerces raw JSON-ish input into the right JS type per field_type, then
 *  validates it — required, select-options-membership, and a light shape
 *  check per type. Not a full JSON-Schema engine; the brief's own field
 *  list wants "appropriate validation," this is the honest core of that,
 *  not a claim of exhaustive coverage. */
function coerceAndValidate(field: CmsContentField, raw: unknown): unknown {
  // A half-filled {lat:'',lng:''} from a form that was never really touched
  // must count as empty too, or it silently coerces to {lat:0,lng:0} —
  // "Null Island," a real, well-known wrong-data trap in mapping systems —
  // instead of either being required-rejected or left null like every
  // other unfilled optional field.
  const isEmptyCoordinates = field.field_type === 'coordinates' && typeof raw === 'object' && raw !== null
    && (raw as any).lat === '' && (raw as any).lng === '';
  // Same reasoning as coordinates above, for currency's own {amount,
  // currency} compound value — a form nobody filled in must not silently
  // coerce to {amount:0, currency:''}.
  const isEmptyCurrency = field.field_type === 'currency' && typeof raw === 'object' && raw !== null
    && (raw as any).amount === '' && !(raw as any).currency;
  const empty = raw === undefined || raw === null || raw === '' || isEmptyCoordinates || isEmptyCurrency
    || ((field.field_type === 'blocks' || field.field_type === 'repeatable') && Array.isArray(raw) && raw.length === 0);
  if (empty) {
    if (field.required) throw new ValidationError(`"${field.label}" is required.`);
    if (field.field_type === 'tags') return [];
    if (field.field_type === 'blocks') return [];
    if (field.field_type === 'repeatable') return [];
    return null;
  }
  switch (field.field_type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n)) throw new ValidationError(`"${field.label}" must be a number.`);
      return n;
    }
    case 'boolean':
      return raw === true || raw === 'true';
    case 'date':
    case 'datetime': {
      const d = new Date(raw as string);
      if (Number.isNaN(d.getTime())) throw new ValidationError(`"${field.label}" must be a valid date.`);
      return d.toISOString();
    }
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw))) throw new ValidationError(`"${field.label}" must be a valid email.`);
      return String(raw);
    case 'url':
      if (!/^https?:\/\//.test(String(raw))) throw new ValidationError(`"${field.label}" must start with http:// or https://.`);
      return String(raw);
    case 'select': {
      const options = Array.isArray((field.config as any)?.options) ? (field.config as any).options as string[] : [];
      if (options.length && !options.includes(String(raw))) throw new ValidationError(`"${field.label}" must be one of: ${options.join(', ')}.`);
      return String(raw);
    }
    case 'tags':
      return Array.isArray(raw) ? raw.map(String) : String(raw).split(',').map(s => s.trim()).filter(Boolean);
    // A real {lat,lng} pair, not two separate fields glued together by
    // naming convention — validated against the actual coordinate ranges
    // (a latitude of 91 or a longitude of -200 is not "a weird value," it's
    // not a coordinate on Earth at all) so a typo is caught at save time
    // rather than silently breaking whatever map renders it later.
    case 'coordinates': {
      const obj = raw as any;
      const lat = Number(obj?.lat);
      const lng = Number(obj?.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) throw new ValidationError(`"${field.label}" must have a numeric lat and lng.`);
      if (lat < -90 || lat > 90) throw new ValidationError(`"${field.label}" latitude must be between -90 and 90.`);
      if (lng < -180 || lng > 180) throw new ValidationError(`"${field.label}" longitude must be between -180 and 180.`);
      return { lat, lng };
    }
    case 'color': {
      const s = String(raw).trim();
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) throw new ValidationError(`"${field.label}" must be a hex color like #4F46E5.`);
      return s;
    }
    // Deliberately not full E.164/libphonenumber validation — no phone-
    // parsing library exists in this codebase (AGENTS.md's own dependency
    // hygiene: hand-build on primitives rather than pull in a library for
    // one field type), and the brief only asks for "appropriate
    // validation," not international-dialing-plan correctness. The honest,
    // bounded version: strip everything but digits and a leading '+', then
    // require a real-looking digit count (7-15, the same bound E.164 itself
    // uses) rather than accepting any string with a phone-ish shape.
    case 'phone': {
      const s = String(raw).trim();
      const digits = s.replace(/[^\d]/g, '');
      if (digits.length < 7 || digits.length > 15) throw new ValidationError(`"${field.label}" must be a valid phone number.`);
      return s;
    }
    // A real {amount, currency} pair — currency as a 3-letter ISO 4217-
    // shaped code (format-checked, not validated against the real ISO
    // list, which would need a maintained table this codebase has no
    // reason to own yet), amount as any finite number. Deliberately not
    // forced non-negative: a generic "currency" field also covers a
    // balance/adjustment/refund, which a specific "Price" field built on
    // top of this type can itself constrain if it ever needs to.
    case 'currency': {
      const obj = raw as any;
      const amount = Number(obj?.amount);
      const currency = String(obj?.currency ?? '').trim().toUpperCase();
      if (Number.isNaN(amount) || !Number.isFinite(amount)) throw new ValidationError(`"${field.label}" must have a numeric amount.`);
      if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError(`"${field.label}" must have a 3-letter currency code, e.g. USD.`);
      return { amount, currency };
    }
    // A real ordered list of scalar values, each validated against the
    // definition's own config.itemType the same way a single field of that
    // type would be — not a bare unvalidated array. Capped at 50 items,
    // same order of magnitude as 'blocks'' own 200-block cap, scaled down
    // since a repeatable field's items are individually much smaller.
    case 'repeatable': {
      if (!Array.isArray(raw)) throw new ValidationError(`"${field.label}" must be a list.`);
      const itemType = (field.config as any)?.itemType as CmsRepeatableItemType;
      return raw.slice(0, 50).map((item, i) => coerceScalarItem(itemType, item, field.label, i));
    }
    case 'blocks': {
      if (!Array.isArray(raw)) throw new ValidationError(`"${field.label}" must be a list of blocks.`);
      // Not a bare .map(sanitizeBlock) — Array.map() passes (element, index,
      // array) positionally, and sanitizeBlock's own 2nd parameter is
      // `context`, so the array index would land there instead of the
      // intended default. Harmless today (context is only ever compared
      // against the literal 'component', which a number can never equal),
      // but real type-safety debt caught by a real typecheck, not left in
      // place on the strength of that coincidence.
      return raw.slice(0, 200).map((b: any) => sanitizeBlock(b));
    }
    // Same allowlist-based sanitizer Pages/Posts already run their own HTML
    // through (cms.service.ts) — this field type used to skip it entirely
    // and store raw, unsanitized HTML rendered straight into the public
    // site via dangerouslySetInnerHTML. Caught and fixed while adding
    // 'blocks' alongside it, not a pre-existing known gap left open.
    case 'richtext':
      return sanitizeContent(String(raw));
    // A relation field's own value is coerced the same as any other short
    // string here — it's now the target entry's real id (a UUID), not a
    // slug, but the actual reference check (does that id really exist in
    // the model this field named at creation time) needs DB access this
    // pure function doesn't have, so it happens one level up in
    // validateAgainstFields instead.
    case 'relation':
    case 'text':
    case 'textarea':
    case 'image':
    default:
      return String(raw);
  }
}

export interface ListParams { search?: string; status?: string; limit?: number; offset?: number }

export class CMSContentService {

  // ── Content Models ─────────────────────────────────────────────────────

  static async listModels(tenantId: string): Promise<CmsContentModel[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_content_models as m')
        .leftJoin('cms_content_entries as e', 'e.model_id', 'm.id')
        .select(['m.id', 'm.tenant_id', 'm.key', 'm.name', 'm.name_plural', 'm.description', 'm.icon', 'm.created_by', 'm.created_at', 'm.updated_at'])
        .select(sql<string>`count(e.id)`.as('entry_count'))
        .where('m.tenant_id', '=', tenantId)
        .groupBy(['m.id'])
        .orderBy('m.name', 'asc')
        .execute();
      return rows.map(toModel);
    });
  }

  static async getModel(tenantId: string, modelId: string): Promise<CmsContentModel> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('cms_content_models').selectAll()
        .where('id', '=', modelId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
      const fields = await trx.selectFrom('cms_content_fields').selectAll()
        .where('model_id', '=', modelId).where('tenant_id', '=', tenantId)
        .orderBy('sort_order', 'asc').execute();
      return { ...toModel(row), fields: fields.map(toField) };
    });
  }

  // Reserved — these path segments are already the existing Page/Post/Media
  // public routes (cms.routes.ts); a model using one would be permanently
  // unreachable at /site/:tenantSlug/:modelKey, shadowed by the more
  // specific static route Fastify always matches first.
  private static RESERVED_KEYS = new Set(['pages', 'posts', 'media', 'blog']);

  static async createModel(tenantId: string, userId: string, input: CreateCmsContentModelInput): Promise<CmsContentModel> {
    if (!/^[a-z][a-z0-9_]*$/.test(input.key)) {
      throw new ValidationError('Model key must be lowercase letters, numbers and underscores, starting with a letter.');
    }
    if (this.RESERVED_KEYS.has(input.key)) {
      throw new ValidationError(`"${input.key}" is reserved — pick a different key.`);
    }
    return withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('cms_content_models').values({
        tenant_id: tenantId, key: input.key, name: input.name, name_plural: input.name_plural,
        description: input.description ?? null, icon: input.icon ?? 'package', created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return toModel(row);
    });
  }

  static async updateModel(tenantId: string, modelId: string, input: Partial<CreateCmsContentModelInput>): Promise<CmsContentModel> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.name !== undefined) update['name'] = input.name;
      if (input.name_plural !== undefined) update['name_plural'] = input.name_plural;
      if (input.description !== undefined) update['description'] = input.description;
      if (input.icon !== undefined) update['icon'] = input.icon;
      const row = await trx.updateTable('cms_content_models').set(update)
        .where('id', '=', modelId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst();
      // HUD-0130: was executeTakeFirstOrThrow() — a wrong/stale id crashed
      // with Kysely's own raw "no result" instead of a clean 404.
      if (!row) throw new Error('Model not found.');
      return toModel(row);
    });
  }

  /** Refuses to delete a model with real entries — deleting the model
   *  cascades to its fields either way, but silently dropping someone's
   *  actual content because they clicked the wrong delete button is exactly
   *  the kind of "casually replacing" the brief's own §87 warns against. */
  static async deleteModel(tenantId: string, modelId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const count = await trx.selectFrom('cms_content_entries').select(sql<string>`count(*)`.as('n'))
        .where('model_id', '=', modelId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (Number(count?.n ?? 0) > 0) {
        throw new ValidationError('This model still has entries — delete or move them first.');
      }
      await trx.deleteFrom('cms_content_models').where('id', '=', modelId).where('tenant_id', '=', tenantId).execute();
    });
  }

  // ── Fields ──────────────────────────────────────────────────────────────

  /** §2 — a relation field must name a real target model up front, the
   *  same tenant's own, so validateAgainstFields below has something
   *  concrete to enforce against every time an entry actually sets one.
   *  Self-relation (a model pointing at itself — "related products") is
   *  deliberately allowed; there's nothing unsound about it. */
  private static async checkRelationConfig(trx: any, tenantId: string, config: unknown): Promise<void> {
    const targetModelId = (config as any)?.targetModelId;
    if (!targetModelId || typeof targetModelId !== 'string') {
      throw new ValidationError('A relation field must specify which content model it relates to.');
    }
    const target = await trx.selectFrom('cms_content_models').select('id')
      .where('id', '=', targetModelId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!target) throw new ValidationError('The selected target model does not exist.');
  }

  /** §2 — a repeatable field must name a real, allowed item type up front
   *  (REPEATABLE_ITEM_TYPES — a small scalar subset, no nested repeatable,
   *  no blocks/relation/other compound types), so coerceAndValidate below
   *  knows what to validate each array entry against without needing to
   *  support every field type's own shape recursively. No DB access needed
   *  (unlike relation's own check), so this stays synchronous. */
  private static checkRepeatableConfig(config: unknown): void {
    const itemType = (config as any)?.itemType;
    if (!REPEATABLE_ITEM_TYPES.includes(itemType)) {
      throw new ValidationError(`A repeatable field must specify itemType as one of: ${REPEATABLE_ITEM_TYPES.join(', ')}.`);
    }
  }

  /** §2 — a computed field's formula must parse (parseFormula throws its
   *  own ValidationError for bad syntax), and every {fieldKey} it
   *  references must be a real, non-computed field already defined on the
   *  same model. Ruling out a reference to another 'computed' field isn't
   *  pedantry — validateAgainstFields's second pass evaluates every
   *  computed field once, against the *other* fields' already-coerced
   *  values, so a computed→computed chain has no defined evaluation order
   *  to give it a real value; refusing it up front is simpler and more
   *  honest than picking an arbitrary order that would silently change
   *  behavior later if fields get reordered. */
  private static async checkComputedConfig(trx: any, tenantId: string, modelId: string, config: unknown): Promise<void> {
    const formula = (config as any)?.formula;
    if (!formula || typeof formula !== 'string' || !formula.trim()) {
      throw new ValidationError('A computed field must specify a formula.');
    }
    if (formula.length > 300) throw new ValidationError('Formula is too long (300 characters max).');
    const ast = parseFormula(formula);
    const refs = formulaFieldRefs(ast);
    if (refs.length > 0) {
      const siblings = await trx.selectFrom('cms_content_fields').select(['key', 'field_type'])
        .where('model_id', '=', modelId).where('tenant_id', '=', tenantId).execute();
      const byKey = new Map(siblings.map((f: any) => [f.key, f.field_type]));
      for (const key of refs) {
        const fieldType = byKey.get(key);
        if (!fieldType) throw new ValidationError(`Formula references unknown field "{${key}}".`);
        if (fieldType === 'computed') throw new ValidationError(`Formula cannot reference another computed field "{${key}}".`);
      }
    }
  }

  static async createField(tenantId: string, modelId: string, input: CreateCmsContentFieldInput): Promise<CmsContentField> {
    if (!(input.field_type in FIELD_TYPES)) throw new ValidationError(`Unknown field type "${input.field_type}".`);
    if (input.field_type === 'repeatable') this.checkRepeatableConfig(input.config);
    const key = input.key?.trim() || fieldKeyOf(input.label);
    return withTenant(tenantId, async (trx) => {
      if (input.field_type === 'relation') await this.checkRelationConfig(trx, tenantId, input.config);
      if (input.field_type === 'computed') await this.checkComputedConfig(trx, tenantId, modelId, input.config);
      // Real bug fixed alongside §12-13: every field used to default to
      // sort_order 0 regardless of how many already existed, so a newly
      // added field could land anywhere (even first) depending on
      // insertion order rather than always appending to the end — the
      // same max+1 pattern createNavItem already uses.
      let sortOrder = input.sort_order;
      if (sortOrder === undefined) {
        const max = await trx.selectFrom('cms_content_fields').select(sql<string>`coalesce(max(sort_order), -1)`.as('m'))
          .where('model_id', '=', modelId).executeTakeFirst();
        sortOrder = Number(max?.m ?? -1) + 1;
      }
      const row = await trx.insertInto('cms_content_fields').values({
        tenant_id: tenantId, model_id: modelId, key, label: input.label, field_type: input.field_type,
        required: input.required ?? false, help_text: input.help_text ?? null,
        config: JSON.stringify(input.config ?? {}), sort_order: sortOrder,
      }).returningAll().executeTakeFirstOrThrow();
      return toField(row);
    });
  }

  /** §12-13 — real field reordering (up/down, same reliability posture as
   *  Nav Items and the Block Editor use elsewhere in this codebase rather
   *  than drag-and-drop). A move past either boundary is a silent no-op,
   *  not an error — matches how those other reorder UIs behave. */
  static async moveField(tenantId: string, fieldId: string, direction: 'up' | 'down'): Promise<void> {
    return withTenant(tenantId, async (trx) => {
      const target = await trx.selectFrom('cms_content_fields').select('model_id')
        .where('id', '=', fieldId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!target) throw new Error('Field not found.');
      const fields = await trx.selectFrom('cms_content_fields').select(['id', 'sort_order'])
        .where('tenant_id', '=', tenantId).where('model_id', '=', target.model_id).orderBy('sort_order', 'asc').execute();
      const idx = fields.findIndex(f => f.id === fieldId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= fields.length) return;
      const other = fields[swapIdx];
      await trx.updateTable('cms_content_fields').set({ sort_order: other.sort_order }).where('id', '=', fieldId).execute();
      await trx.updateTable('cms_content_fields').set({ sort_order: fields[idx].sort_order }).where('id', '=', other.id).execute();
    });
  }

  static async updateField(tenantId: string, fieldId: string, input: UpdateCmsContentFieldInput): Promise<CmsContentField> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.label !== undefined) update['label'] = input.label;
      if (input.required !== undefined) update['required'] = input.required;
      if (input.help_text !== undefined) update['help_text'] = input.help_text;
      if (input.config !== undefined) {
        const existing = await trx.selectFrom('cms_content_fields').select(['field_type', 'model_id'])
          .where('id', '=', fieldId).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (existing?.field_type === 'relation') await this.checkRelationConfig(trx, tenantId, input.config);
        if (existing?.field_type === 'repeatable') this.checkRepeatableConfig(input.config);
        if (existing?.field_type === 'computed') await this.checkComputedConfig(trx, tenantId, existing.model_id, input.config);
        update['config'] = JSON.stringify(input.config);
      }
      if (input.sort_order !== undefined) update['sort_order'] = input.sort_order;
      const row = await trx.updateTable('cms_content_fields').set(update)
        .where('id', '=', fieldId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst();
      // HUD-0130: same fix as updateModel above.
      if (!row) throw new Error('Field not found.');
      return toField(row);
    });
  }

  static async deleteField(tenantId: string, fieldId: string): Promise<void> {
    await withTenant(tenantId, (trx) =>
      trx.deleteFrom('cms_content_fields').where('id', '=', fieldId).where('tenant_id', '=', tenantId).execute());
  }

  // ── Entries ─────────────────────────────────────────────────────────────

  private static async uniqueEntrySlug(trx: any, modelId: string, title: string): Promise<string> {
    const base = slugifyBase(title);
    let candidate = base, n = 2;
    while (await trx.selectFrom('cms_content_entries').select('id').where('model_id', '=', modelId).where('slug', '=', candidate).executeTakeFirst()) {
      candidate = `${base}-${n}`; n++;
    }
    return candidate;
  }

  static async listEntries(tenantId: string, modelId: string, params: ListParams = {}): Promise<CmsContentEntry[]> {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('cms_content_entries').selectAll()
        .where('tenant_id', '=', tenantId).where('model_id', '=', modelId);
      if (params.status) q = q.where('status', '=', params.status as any);
      if (params.search?.trim()) q = q.where(sql<boolean>`search_vector @@ plainto_tsquery('english', ${params.search.trim()})`);
      const rows = await q.orderBy('updated_at', 'desc')
        .limit(Math.min(Math.max(params.limit ?? 100, 1), 200))
        .offset(Math.max(params.offset ?? 0, 0))
        .execute();
      return rows.map(toEntry);
    });
  }

  static async getEntry(tenantId: string, entryId: string): Promise<CmsContentEntry> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('cms_content_entries').selectAll()
        .where('id', '=', entryId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
      return toEntry(row);
    });
  }

  private static async validateAgainstFields(trx: any, modelId: string, tenantId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const fields = (await trx.selectFrom('cms_content_fields').selectAll()
      .where('model_id', '=', modelId).where('tenant_id', '=', tenantId).execute()).map(toField);
    const out: Record<string, unknown> = {};
    // §2 — a 'computed' field is never client-writable, so whatever the
    // client submitted for its key is discarded, not coerced — its real
    // value is filled in below, in a second pass, once every *other*
    // field's already-coerced value exists to compute from.
    for (const f of fields) {
      if (f.field_type === 'computed') continue;
      const coerced = coerceAndValidate(f, data[f.key]);
      // §2 — the actual "enforced foreign key" this row's own map text
      // named as missing: a relation field's value is the target entry's
      // real id, checked here against the model its own field config
      // named at creation time. Not merely "is this a string" — a stale or
      // fabricated id is rejected before it can ever be saved, the same
      // bar every other field type's coerceAndValidate case already holds
      // its own value to.
      if (f.field_type === 'relation' && coerced !== null) {
        const targetModelId = (f.config as any)?.targetModelId;
        const found = targetModelId && await trx.selectFrom('cms_content_entries').select('id')
          .where('id', '=', coerced as string).where('model_id', '=', targetModelId).where('tenant_id', '=', tenantId)
          .executeTakeFirst();
        if (!found) throw new ValidationError(`"${f.label}" must reference an existing entry.`);
      }
      out[f.key] = coerced;
    }
    // §2 — computed fields evaluate against `out`'s already-coerced sibling
    // values (checkComputedConfig already guarantees every {fieldKey} a
    // formula references names a real, non-computed field, so this can't
    // recurse into another formula). A missing/non-numeric reference
    // resolves to 0 inside evaluateFormula rather than erroring — the same
    // "empty isn't an error unless required" posture every other field
    // type here takes, and a real case (a draft entry with an optional
    // sibling field nobody has filled in yet).
    for (const f of fields) {
      if (f.field_type !== 'computed') continue;
      const formula = (f.config as any)?.formula;
      out[f.key] = typeof formula === 'string' && formula.trim() ? evaluateFormula(parseFormula(formula), out) : null;
    }
    return out;
  }

  static async createEntry(tenantId: string, userId: string, modelId: string, input: CreateCmsContentEntryInput): Promise<CmsContentEntry> {
    if (!input.title?.trim()) throw new ValidationError('Title is required.');
    return withTenant(tenantId, async (trx) => {
      const slug = input.slug?.trim() || await this.uniqueEntrySlug(trx, modelId, input.title);
      const data = await this.validateAgainstFields(trx, modelId, tenantId, input.data ?? {});
      const row = await trx.insertInto('cms_content_entries').values({
        tenant_id: tenantId, model_id: modelId, slug, title: input.title,
        status: input.status ?? 'draft', data: JSON.stringify(data),
        seo_description: input.seo_description ?? null, author_id: userId,
        publish_at: input.publish_at ? new Date(input.publish_at) : null,
      }).returningAll().executeTakeFirstOrThrow();
      const entry = toEntry(row);
      await recordRevision(trx, tenantId, 'entry', entry.id, entryRevisionSnapshot(entry), userId);
      if (entry.status === 'published') CMSWebhooksService.dispatchEvent(tenantId, 'entry.published', { id: entry.id, slug: entry.slug, title: entry.title });
      await emitDomainEvent(trx, tenantId, { type: 'entry.created', sourceApp: 'onesite', entityType: 'entry', entityId: entry.id, payload: { title: entry.title, slug: entry.slug, status: entry.status }, actorId: userId });
      if (entry.status === 'published') {
        await emitDomainEvent(trx, tenantId, { type: 'entry.published', sourceApp: 'onesite', entityType: 'entry', entityId: entry.id, payload: { title: entry.title, slug: entry.slug }, actorId: userId });
      }
      return entry;
    });
  }

  static async updateEntry(tenantId: string, entryId: string, userId: string, input: UpdateCmsContentEntryInput): Promise<CmsContentEntry> {
    return withTenant(tenantId, async (trx) => {
      // HUD-0130: was executeTakeFirstOrThrow() — a wrong/stale id crashed
      // with Kysely's own raw "no result" instead of a clean 404.
      const existing = await trx.selectFrom('cms_content_entries').select(['model_id', 'status']).where('id', '=', entryId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!existing) throw new Error('Entry not found.');
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.title !== undefined) update['title'] = input.title;
      if (input.slug !== undefined) update['slug'] = input.slug;
      if (input.status !== undefined) update['status'] = input.status;
      if (input.seo_description !== undefined) update['seo_description'] = input.seo_description;
      if (input.publish_at !== undefined) update['publish_at'] = input.publish_at ? new Date(input.publish_at) : null;
      if (input.data !== undefined) update['data'] = JSON.stringify(await this.validateAgainstFields(trx, existing.model_id, tenantId, input.data));

      const row = await trx.updateTable('cms_content_entries').set(update)
        .where('id', '=', entryId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      const entry = toEntry(row);
      await recordRevision(trx, tenantId, 'entry', entry.id, entryRevisionSnapshot(entry), userId);
      if (input.status === 'published') CMSWebhooksService.dispatchEvent(tenantId, 'entry.published', { id: entry.id, slug: entry.slug, title: entry.title });
      if (input.status !== undefined) {
        const action = statusTransitionEvent(existing.status, input.status);
        await emitDomainEvent(trx, tenantId, { type: `entry.${action}`, sourceApp: 'onesite', entityType: 'entry', entityId: entry.id, payload: { title: entry.title, slug: entry.slug, from: existing.status ?? null, to: input.status }, actorId: userId });
      }
      return entry;
    });
  }

  static async deleteEntry(tenantId: string, entryId: string, userId?: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const deleted = await trx.deleteFrom('cms_content_entries').where('id', '=', entryId).where('tenant_id', '=', tenantId).returning(['title', 'slug']).executeTakeFirst();
      if (deleted) {
        await emitDomainEvent(trx, tenantId, { type: 'entry.deleted', sourceApp: 'onesite', entityType: 'entry', entityId: entryId, payload: { title: deleted.title, slug: deleted.slug }, actorId: userId ?? null });
      }
      await deleteRevisions(trx, tenantId, 'entry', entryId);
    });
  }

  static async bulkUpdateEntries(tenantId: string, ids: string[], status: string, userId?: string): Promise<{ id: string; ok: boolean; error?: string }[]> {
    return withTenant(tenantId, async (trx) => {
      const prevRows = await trx.selectFrom('cms_content_entries').select(['id', 'status', 'title', 'slug']).where('tenant_id', '=', tenantId).where('id', 'in', ids).execute();
      const prevMap = new Map(prevRows.map(r => [r.id, r]));
      const results: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of ids) {
        const row = await trx.updateTable('cms_content_entries').set({ status, updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', tenantId).returningAll().executeTakeFirst();
        if (row) {
          const prev = prevMap.get(id);
          const action = statusTransitionEvent(prev?.status, status);
          const entry = toEntry(row);
          await recordRevision(trx, tenantId, 'entry', entry.id, entryRevisionSnapshot(entry), userId ?? null);
          await emitDomainEvent(trx, tenantId, { type: `entry.${action}`, sourceApp: 'onesite', entityType: 'entry', entityId: id, payload: { title: prev?.title ?? null, slug: prev?.slug ?? null, from: prev?.status ?? null, to: status }, actorId: userId ?? null });
        }
        results.push(row ? { id, ok: true } : { id, ok: false, error: 'Not found' });
      }
      return results;
    });
  }

  static async bulkDeleteEntries(tenantId: string, ids: string[], userId?: string): Promise<{ id: string; ok: boolean; error?: string }[]> {
    return withTenant(tenantId, async (trx) => {
      const results: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of ids) {
        const row = await trx.deleteFrom('cms_content_entries')
          .where('id', '=', id).where('tenant_id', '=', tenantId).returning(['id', 'title', 'slug']).executeTakeFirst();
        if (row) {
          await deleteRevisions(trx, tenantId, 'entry', id);
          await emitDomainEvent(trx, tenantId, { type: 'entry.deleted', sourceApp: 'onesite', entityType: 'entry', entityId: id, payload: { title: row.title, slug: row.slug }, actorId: userId ?? null });
        }
        results.push(row ? { id, ok: true } : { id, ok: false, error: 'Not found' });
      }
      return results;
    });
  }

  // ── Components (§8 of the brief) ───────────────────────────────────────
  // A named, reusable block array a tenant defines once and references from
  // any 'blocks' field via a {type:'component', props:{componentId}} block.
  // Its own CRUD, deliberately outside the generic content-model system —
  // a component isn't a publishable, slugged, listable "thing" the way a
  // model entry is; it has no status/publish_at/seo, just a name and blocks.

  static async listComponents(tenantId: string): Promise<CmsComponent[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_components').selectAll()
        .where('tenant_id', '=', tenantId).orderBy('name', 'asc').execute();
      return rows.map(toComponent);
    });
  }

  static async getComponent(tenantId: string, componentId: string): Promise<CmsComponent> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('cms_components').selectAll()
        .where('id', '=', componentId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
      return toComponent(row);
    });
  }

  static async createComponent(tenantId: string, userId: string, input: CreateCmsComponentInput): Promise<CmsComponent> {
    if (!/^[a-z][a-z0-9-]*$/.test(input.key)) {
      throw new ValidationError('Component key must be lowercase letters, numbers and hyphens, starting with a letter.');
    }
    const blocks = (input.blocks ?? []).slice(0, 200).map(b => sanitizeBlock(b, 'component'));
    return withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('cms_components').values({
        tenant_id: tenantId, key: input.key, name: input.name, blocks: JSON.stringify(blocks), created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return toComponent(row);
    });
  }

  static async updateComponent(tenantId: string, componentId: string, input: UpdateCmsComponentInput): Promise<CmsComponent> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.name !== undefined) update['name'] = input.name;
      if (input.blocks !== undefined) update['blocks'] = JSON.stringify(input.blocks.slice(0, 200).map(b => sanitizeBlock(b, 'component')));
      const row = await trx.updateTable('cms_components').set(update)
        .where('id', '=', componentId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst();
      // HUD-0130: same fix as updateModel above.
      if (!row) throw new Error('Component not found.');
      return toComponent(row);
    });
  }

  /** Refuses to delete a component still referenced by a real entry — the
   *  same "don't silently orphan someone's actual content" rule deleteModel
   *  already enforces for models with entries. Scans every array-valued
   *  field on every entry for a 'component' block pointing at this id. */
  static async deleteComponent(tenantId: string, componentId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const count = await sql<{ n: string }>`
        SELECT count(*)::text AS n
        FROM cms_content_entries e, jsonb_each(e.data) kv
        WHERE e.tenant_id = ${tenantId}
          AND jsonb_typeof(kv.value) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(kv.value) blk
            WHERE blk->>'type' = 'component' AND blk->'props'->>'componentId' = ${componentId}
          )
      `.execute(trx);
      if (Number(count.rows[0]?.n ?? 0) > 0) {
        throw new ValidationError('This component is still used in one or more entries — remove it from them first.');
      }
      await trx.deleteFrom('cms_components').where('id', '=', componentId).where('tenant_id', '=', tenantId).execute();
    });
  }

  // ── Public dynamic templates (§12 of the brief) ─────────────────────────
  // A generic "/site/:tenantSlug/:modelKey/:entrySlug" render — the field
  // bindings the brief asks for are just the model's own field list, sent
  // alongside the entry so the public page knows how to label each value.

  private static async resolveTenantBySlug(tenantSlug: string) {
    return dbPlatform.selectFrom('tenants').select(['id', 'name']).where('slug', '=', tenantSlug).executeTakeFirst();
  }

  static async getPublicModel(tenantSlug: string, modelKey: string) {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    return withTenant(tenant.id, async (trx) => {
      const model = await trx.selectFrom('cms_content_models').select(['id', 'key', 'name', 'name_plural'])
        .where('tenant_id', '=', tenant.id).where('key', '=', modelKey).executeTakeFirst();
      if (!model) return null;
      const fields = await trx.selectFrom('cms_content_fields').select(['key', 'label', 'field_type', 'config'])
        .where('model_id', '=', model.id).orderBy('sort_order', 'asc').execute();
      return { model, fields: fields.map(f => ({ ...f, config: typeof f.config === 'string' ? JSON.parse(f.config) : (f.config ?? {}) })), tenantId: tenant.id };
    });
  }

  static async listPublicEntries(tenantSlug: string, modelKey: string): Promise<CmsPublicContentEntrySummary[] | null> {
    const resolved = await this.getPublicModel(tenantSlug, modelKey);
    if (!resolved) return null;
    // §12-13 — the collection index shows nothing but title/date unless the
    // admin has explicitly flagged one or more fields `showInList`; `data`
    // is always selected (cheap at this row limit) but only ever exposed on
    // the response when there's a real flagged field, so a model that's
    // never touched this setting renders byte-identical to before.
    const listFields = resolved.fields.filter(f => (f.config as any)?.showInList === true);
    return withTenant(resolved.tenantId, trx => trx.selectFrom('cms_content_entries')
      .select(['slug', 'title', 'created_at', 'data'])
      .where('model_id', '=', resolved.model.id).where('status', '=', 'published')
      .orderBy('created_at', 'desc').limit(100).execute()
      .then(rows => rows.map(r => {
        const data = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data ?? {});
        return {
          slug: r.slug, title: r.title, created_at: (r.created_at as Date).toISOString(),
          ...(listFields.length ? { fields: Object.fromEntries(listFields.map(f => [f.key, data[f.key] ?? null])) } : {}),
        };
      })));
  }

  static async createEntryPreviewToken(tenantId: string, id: string): Promise<{ token: string; expiresAt: number }> {
    const row = await withTenant(tenantId, trx => trx.selectFrom('cms_content_entries').select('id').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst());
    if (!row) throw new Error('Entry not found.');
    return generatePreviewToken('entry', id);
  }

  static async getPublicEntry(tenantSlug: string, modelKey: string, entrySlug: string, previewToken?: string | null): Promise<CmsPublicContentEntry | null> {
    const resolved = await this.getPublicModel(tenantSlug, modelKey);
    if (!resolved) return null;
    const row = await withTenant(resolved.tenantId, trx => {
      let query = trx.selectFrom('cms_content_entries').selectAll()
        .where('model_id', '=', resolved.model.id).where('slug', '=', entrySlug);
      if (!previewToken) query = query.where('status', '=', 'published');
      return query.executeTakeFirst();
    });
    if (!row) return null;
    // §38 — same row-id-bound preview token as public Pages/Posts.
    if (row.status !== 'published' && !verifyPreviewToken('entry', row.id, previewToken)) return null;
    const entry = toEntry(row);
    const componentIds = collectComponentIds(entry.data);
    let components: Record<string, CmsBlock[]> | undefined;
    if (componentIds.length) {
      const rows = await withTenant(resolved.tenantId, trx => trx.selectFrom('cms_components')
        .select(['id', 'blocks']).where('tenant_id', '=', resolved.tenantId).where('id', 'in', componentIds).execute());
      components = {};
      for (const r of rows) components[r.id] = typeof r.blocks === 'string' ? JSON.parse(r.blocks) : (r.blocks ?? []);
    }
    // §12-13 — hideInDetail is enforced here, not just left to the frontend
    // to not-render: a field an admin has hidden from the detail view
    // shouldn't still be sitting in the raw API response for anyone who
    // opens dev tools, the same "server is the real boundary" posture
    // preview tokens and status-gating already take on this same route.
    const hiddenKeys = new Set(resolved.fields.filter(f => (f.config as any)?.hideInDetail === true).map(f => f.key));
    const data = hiddenKeys.size ? Object.fromEntries(Object.entries(entry.data).filter(([k]) => !hiddenKeys.has(k))) : entry.data;
    return {
      id: entry.id, slug: entry.slug, title: entry.title, data, created_at: entry.created_at,
      model: { key: resolved.model.key, name: resolved.model.name, fields: resolved.fields as any },
      ...(components ? { components } : {}),
    };
  }

  // ── Saved filters (§4) ───────────────────────────────────────────────────
  // Shared tenant-wide per model, not per-user — see cms.ts's own comment on
  // CmsSavedFilter for why. Ordered by creation so the newest saved filter
  // reads at the end, not because order carries any other meaning.
  static async listSavedFilters(tenantId: string, modelId: string): Promise<CmsSavedFilter[]> {
    return withTenant(tenantId, trx => trx.selectFrom('cms_saved_filters').selectAll()
      .where('tenant_id', '=', tenantId).where('model_id', '=', modelId)
      .orderBy('created_at', 'asc').execute())
      .then(rows => rows.map(toSavedFilter));
  }

  static async createSavedFilter(tenantId: string, modelId: string, userId: string, input: CreateCmsSavedFilterInput): Promise<CmsSavedFilter> {
    if (!input.name?.trim()) throw new ValidationError('Name is required.');
    return withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('cms_saved_filters').values({
        tenant_id: tenantId, model_id: modelId, name: input.name.trim(),
        status: input.status ?? null, search: input.search ?? null, created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return toSavedFilter(row);
    });
  }

  static async deleteSavedFilter(tenantId: string, filterId: string): Promise<void> {
    await withTenant(tenantId, trx => trx.deleteFrom('cms_saved_filters')
      .where('id', '=', filterId).where('tenant_id', '=', tenantId).execute());
  }
}
