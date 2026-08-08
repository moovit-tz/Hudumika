import fs from 'fs';

const lensContent = fs.readFileSync('apps/web/src/pages/Lens.tsx', 'utf8');

const content = `import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';

type Kind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK';
type Status = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
type Confidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';

interface Link { provider: string; kind: string; external_id: string; url: string | null; external_status: string | null }
interface Card {
  id: string; ref: string; kind: Kind; title: string; status: string;
  severity: string; confidence: Confidence; waiting_on: string | null;
  area_name: string | null; links: Link[];
}
interface Column { id: string; name: string; status: string; wip_limit: number | null; items: Card[]; count: number; over_wip: boolean }

interface Item {
  id: string; ref: string; kind: Kind; title: string; body: string | null;
  area_id: string | null; area_name?: string | null;
  status: Status; severity: Severity; confidence: Confidence;
  evidence: string | null; waiting_on: string | null;
  refs: string[]; tags: string[];
  resolution: string | null; created_at: string;
}
interface Area { id: string; name: string; kind: string; description: string | null }
interface Stats {
  total: number; open: number; unproven: number;
  by_kind: Record<string, number>; by_severity: Record<string, number>;
  by_confidence: Record<string, number>;
}
interface Event { id: string; kind: string; detail: string | null; actor_name: string | null; created_at: string }

const KIND_VARIANT: Record<Kind, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  BUG: 'error', FEATURE: 'brand', DEBT: 'warning', DECISION: 'info', QUESTION: 'gray', RISK: 'error',
};
const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: 'var(--red)', HIGH: 'var(--gold)', NORMAL: 'var(--ink3)', LOW: 'var(--ink3)',
};
const CONFIDENCE_VARIANT: Record<Confidence, 'success' | 'warning' | 'gray'> = {
  CONFIRMED: 'success', SUSPECTED: 'warning', UNVERIFIED: 'gray',
};
const CONFIDENCE_HINT: Record<Confidence, string> = {
  CONFIRMED: 'Somebody ran this and it behaved as described.',
  SUSPECTED: 'A reading of the code. Nobody has reproduced it yet.',
  UNVERIFIED: 'Reported, not yet looked at.',
};
const PROVIDER_ICON: Record<string, string> = {
  github: 'gitBranch', slack: 'chatBubble', jira: 'layers', linear: 'list', circleci: 'refresh',
};

const KINDS: Kind[] = ['BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK'];
const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX'];
const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
const CONFIDENCES: Confidence[] = ['CONFIRMED', 'SUSPECTED', 'UNVERIFIED'];

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' };
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13,
  fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)', width: '100%',
};
const label: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4,
};

`;

const lines = lensContent.split('\\n');
let composeLines = [];
let detailLines = [];
let inCompose = false;
let inDetail = false;

for (let line of lines) {
  if (line.includes('function Compose(')) inCompose = true;
  if (line.includes('function Detail(')) inDetail = true;
  if (line.includes('export function Lens(')) {
    inCompose = false;
    inDetail = false;
  }
  
  if (inCompose) composeLines.push(line);
  if (inDetail) detailLines.push(line);
}

const composeText = composeLines.join('\\n');
const detailText = detailLines.join('\\n');

fs.writeFileSync('rewrite_lens.ts', content + '\\n' + composeText + '\\n' + detailText);
