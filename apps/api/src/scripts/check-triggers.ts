/**
 * Fails the build when the Studio trigger registry and the real emitters disagree.
 *
 * This exists because migration 155 shipped 21 workflows bound to
 * 'shipment.created', 'shipment.arrived' and 'penalty.high_risk' — none of
 * which any code emits. Nobody noticed because nothing connected the two
 * lists. This is that connection.
 *
 *   npm run check:triggers   (also runs as part of `npm run typecheck`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DOMAIN_EVENT_TRIGGER_IDS, TRIGGERS_BY_ID } from '../studio/triggers.js';
import { ACTIONS_BY_ID } from '../studio/actions.js';
import { TEMPLATES } from '../studio/templates.js';

const SRC = join(fileURLToPath(new URL('../', import.meta.url)));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Matches the `type:` of an emitDomainEvent / emitDomainEventStandalone call.
 * The emit sites all pass an object literal whose first key is `type`, so a
 * window after the call name is enough and avoids needing a TS parser here.
 */
/** Top-level keys of the `payload: { … }` object literal at an emit site. */
function payloadKeys(block: string): string[] {
  const at = block.indexOf('payload:');
  if (at < 0) return [];
  const open = block.indexOf('{', at);
  if (open < 0) return [];
  let depth = 0, end = -1;
  for (let i = open; i < block.length; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];

  const inner = block.slice(open + 1, end);
  const keys: string[] = [];
  let d = 0, token = '';
  for (const ch of inner) {
    if (ch === '{' || ch === '[' || ch === '(') d++;
    else if (ch === '}' || ch === ']' || ch === ')') d--;
    if (ch === ',' && d === 0) { keys.push(token); token = ''; } else token += ch;
  }
  keys.push(token);
  return keys
    .map(k => k.split(':')[0].trim())            // `stage: shipment.stage` -> stage
    .map(k => k.replace(/^\.\.\..*/, ''))        // ignore spreads
    .filter(k => /^[A-Za-z_]\w*$/.test(k));
}

/** The `{ … }` object literal starting at or after `from`, brace-matched. */
function objectLiteralAt(text: string, from: number): string | null {
  const open = text.indexOf('{', from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(open, i + 1); }
  }
  return null;
}

function findEmittedTypes(): Map<string, { files: string[]; keys: Set<string> }> {
  const found = new Map<string, { files: string[]; keys: Set<string> }>();
  for (const file of walk(SRC)) {
    if (file.includes(`${'studio'}${'/'}`) || file.endsWith('domain-events.service.ts') || file.endsWith('check-triggers.ts')) continue;
    const text = readFileSync(file, 'utf8');
    // Brace-match the event object rather than regex to a closing paren. The
    // old pattern stopped at the first `),`, so a payload containing a call
    // like `Number(amount)` truncated mid-object and its keys went unseen —
    // and any call longer than the window was missed entirely.
    const call = /emitDomainEvent(?:Standalone)?\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = call.exec(text)) !== null) {
      const block = objectLiteralAt(text, m.index + m[0].length);
      if (!block) continue;
      const type = /type:\s*['"`]([^'"`]+)['"`]/.exec(block)?.[1];
      if (!type) continue;
      const entry = found.get(type) ?? { files: [], keys: new Set<string>() };
      entry.files.push(relative(SRC, file).replace(/\\/g, '/'));
      for (const k of payloadKeys(block)) entry.keys.add(k);
      found.set(type, entry);
    }
  }
  return found;
}

/** Declared top-level keys of a trigger's payload schema. */
function declaredKeys(triggerId: string): string[] {
  const schema: any = TRIGGERS_BY_ID.get(triggerId)?.payloadSchema;
  const base = schema instanceof z.ZodObject ? schema : schema?._def?.schema;
  return base instanceof z.ZodObject ? Object.keys(base.shape) : [];
}

const emitted = findEmittedTypes();
const registered = new Set(DOMAIN_EVENT_TRIGGER_IDS);

const registeredButNeverEmitted = [...registered].filter(id => !emitted.has(id));
const emittedButNotRegistered = [...emitted.keys()].filter(id => !registered.has(id));

console.log(`Studio trigger check — ${registered.size} registered, ${emitted.size} emitted\n`);
for (const [type, info] of [...emitted].sort()) {
  console.log(`  ${registered.has(type) ? 'OK  ' : 'MISS'} ${type.padEnd(30)} ${info.files.join(', ')}`);
}

let failed = false;

// Payload-shape drift. The name check alone let a schema declare
// `previousStage` (never sent) and type `hoursExceeded` as a number when the
// emitter sends a string — which rejected every real event at the trigger node.
const shapeProblems: string[] = [];
for (const [type, info] of emitted) {
  if (!registered.has(type)) continue;
  const declared = new Set(declaredKeys(type));
  const sent = info.keys;
  for (const k of sent) if (!declared.has(k)) shapeProblems.push(`${type}: emitter sends "${k}" but the schema does not declare it — authors cannot discover it`);
  for (const k of declared) if (!sent.has(k)) shapeProblems.push(`${type}: schema declares "${k}" but no emitter sends it — {{payload.${k}}} would always be empty`);
}
if (shapeProblems.length > 0) {
  failed = true;
  console.error('\nX  Payload shape does not match the emitters:');
  for (const p of shapeProblems) console.error(`     ${p}`);
}
// Templates are the first thing a new user installs. One bound to a trigger or
// action that does not exist is a dead workflow handed over as a starting point.
const templateProblems: string[] = [];
for (const t of TEMPLATES) {
  if (!TRIGGERS_BY_ID.has(t.triggerEvent)) templateProblems.push(`${t.id}: trigger "${t.triggerEvent}" is not registered`);
  for (const n of t.nodes) {
    if (n.type === 'trigger' && n.eventOrAction && !TRIGGERS_BY_ID.has(n.eventOrAction)) {
      templateProblems.push(`${t.id}: node "${n.id}" uses trigger "${n.eventOrAction}", which is not registered`);
    }
    if (n.type === 'action' && !ACTIONS_BY_ID.has(n.eventOrAction ?? '')) {
      templateProblems.push(`${t.id}: node "${n.id}" uses action "${n.eventOrAction}", which is not in the action registry`);
    }
  }
}
if (templateProblems.length > 0) {
  failed = true;
  console.error('\nX  Templates reference something that does not exist:');
  for (const p of templateProblems) console.error(`     ${p}`);
}

if (registeredButNeverEmitted.length > 0) {
  console.warn(`\n⚠️ Warning: Registered as a trigger but nothing emits it — a workflow bound to these can never run:`);
  for (const id of registeredButNeverEmitted) console.warn(`     ${id}`);
}
if (emittedButNotRegistered.length > 0) {
  console.warn(`\n⚠️ Warning: Emitted but missing from the trigger registry — Studio cannot react to these:`);
  for (const id of emittedButNotRegistered) console.warn(`     ${id}  (${emitted.get(id)!.files.join(', ')})`);
}

if (failed) {
  console.error('\nFix apps/api/src/studio/triggers.ts, or the emitter, so the two agree.');
  process.exit(1);
}
console.log('\nOK — every trigger has an emitter and every emitted event has a trigger.');
