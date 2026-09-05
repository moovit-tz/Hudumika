// ─── VersionHistoryPanel.tsx — real document version history + content diff ──
// A genuine "Google-Docs-style" version list + revert for the eSign editor's
// working document (see sign-versions.routes.ts's own header comment for how
// this is a distinct, lighter-weight concept from the existing envelope-level
// amend/version chain). Selecting a version shows what actually changed
// since its predecessor — a real page-level diff computed from the two PDFs'
// own extracted text (pdf.js getTextContent, matched by content similarity,
// worded diff via the `diff` package), not a fabricated or tool-specific
// stub: this same algorithm handles a version that came from Organize Pages,
// a rotate/watermark/OCR pass, or a fresh re-upload identically, because it
// only ever looks at the two real PDFs, never at which tool produced them.
import React, { useEffect, useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { diffWords } from 'diff';
import { apiFetch } from '../../lib/api.js';
import { usePdfDocument } from '../cloud/lib/usePdfDocument.js';
import { PdfPageCanvas } from '../cloud/components/PdfPageCanvas.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';

interface VersionListItem {
  id: string; version_number: number; file_name: string | null;
  change_summary: string; change_details: any;
  created_by: string | null; created_by_name: string; created_at: string;
}

const THUMB_W = 160;

async function extractPageTexts(doc: PDFDocumentProxy): Promise<{ pageNumber: number; text: string }[]> {
  const out: { pageNumber: number; text: string }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    out.push({ pageNumber: n, text: (content.items as any[]).map(it => it.str ?? '').join(' ') });
  }
  return out;
}

function tokenSimilarity(a: string, b: string): number {
  // Jaccard token overlap — cheap and robust for "is this roughly the same
  // page" without an O(n^2) edit-distance pass over potentially long text.
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / (ta.size + tb.size - hit);
}

type PageDiffStatus = 'unchanged' | 'modified' | 'added' | 'removed' | 'moved';
interface PageDiffEntry { status: PageDiffStatus; newPageNumber?: number; oldPageNumber?: number; oldText?: string; newText?: string; }

const SIMILARITY_MATCH_THRESHOLD = 0.35;
const SIMILARITY_IDENTICAL_THRESHOLD = 0.985;

function computePageDiff(
  oldPages: { pageNumber: number; text: string }[],
  newPages: { pageNumber: number; text: string }[],
): PageDiffEntry[] {
  const usedOld = new Set<number>();
  const matchByNew = new Map<number, { oldPageNumber: number; similarity: number; oldText: string }>();

  for (const np of newPages) {
    let best: { oldPageNumber: number; similarity: number; oldText: string } | null = null;
    for (const op of oldPages) {
      if (usedOld.has(op.pageNumber)) continue;
      const sim = tokenSimilarity(np.text, op.text);
      if (sim >= SIMILARITY_MATCH_THRESHOLD && (!best || sim > best.similarity)) {
        best = { oldPageNumber: op.pageNumber, similarity: sim, oldText: op.text };
      }
    }
    if (best) { matchByNew.set(np.pageNumber, best); usedOld.add(best.oldPageNumber); }
  }

  // Moved: among matched pairs, the old page numbers should appear in the
  // same relative order as before (longest-increasing-subsequence, same
  // technique PdfPageOrganizer.tsx uses for its own moved-page tracking) —
  // whichever matched pages break that increasing sequence actually changed
  // position, not just "got a new page number because pages were inserted
  // around them."
  const matchedNewPages = newPages.filter(np => matchByNew.has(np.pageNumber));
  const seq = matchedNewPages.map(np => matchByNew.get(np.pageNumber)!.oldPageNumber);
  const n = seq.length;
  const dp = new Array(n).fill(1);
  const prev = new Array(n).fill(-1);
  let bestEnd = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (seq[j] < seq[i] && dp[j] + 1 > dp[i]) { dp[i] = dp[j] + 1; prev[i] = j; }
    }
    if (dp[i] > dp[bestEnd]) bestEnd = i;
  }
  const inSequence = new Array(n).fill(false);
  for (let k = bestEnd; k !== -1; k = prev[k]) inSequence[k] = true;

  const entries: PageDiffEntry[] = [];
  matchedNewPages.forEach((np, i) => {
    const m = matchByNew.get(np.pageNumber)!;
    const identical = m.similarity >= SIMILARITY_IDENTICAL_THRESHOLD;
    entries.push({
      status: identical ? (inSequence[i] ? 'unchanged' : 'moved') : 'modified',
      newPageNumber: np.pageNumber, oldPageNumber: m.oldPageNumber,
      oldText: m.oldText, newText: np.text,
    });
  });
  for (const np of newPages) {
    if (!matchByNew.has(np.pageNumber)) entries.push({ status: 'added', newPageNumber: np.pageNumber, newText: np.text });
  }
  for (const op of oldPages) {
    if (!usedOld.has(op.pageNumber)) entries.push({ status: 'removed', oldPageNumber: op.pageNumber, oldText: op.text });
  }
  // Render in new-document order, removed pages appended at the position
  // implied by their own old page number relative to the rest.
  entries.sort((a, b) => (a.newPageNumber ?? (a.oldPageNumber! + 0.5)) - (b.newPageNumber ?? (b.oldPageNumber! + 0.5)));
  return entries;
}

const STATUS_STYLE: Record<PageDiffStatus, { accent: string | null; tint: string; label: string | null }> = {
  unchanged: { accent: null, tint: 'var(--card-bg)', label: null },
  modified: { accent: 'var(--gold)', tint: 'var(--gold-l)', label: 'Modified' },
  added: { accent: 'var(--blue)', tint: 'var(--blue-l)', label: 'Added' },
  removed: { accent: 'var(--red)', tint: 'var(--red-l)', label: 'Removed' },
  moved: { accent: 'var(--purple)', tint: 'var(--purple-l)', label: 'Moved' },
};

function WordDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = useMemo(() => diffWords(oldText, newText), [oldText, newText]);
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ink2)', maxHeight: 140, overflowY: 'auto', padding: '8px 10px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}>
      {parts.map((part, i) => (
        <span key={i} style={
          part.added ? { background: 'var(--green-l)', color: 'var(--green)', textDecoration: 'underline' }
          : part.removed ? { background: 'var(--red-l)', color: 'var(--red)', textDecoration: 'line-through' }
          : undefined
        }>
          {part.value}
        </span>
      ))}
    </div>
  );
}

function DiffPageCard({ entry, oldDoc, newDoc }: { entry: PageDiffEntry; oldDoc: PDFDocumentProxy | null; newDoc: PDFDocumentProxy | null }) {
  const style = STATUS_STYLE[entry.status];
  const doc = entry.newPageNumber ? newDoc : oldDoc;
  const pageNumber = entry.newPageNumber ?? entry.oldPageNumber!;
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    doc.getPage(pageNumber).then(page => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setNaturalSize({ w: vp.width, h: vp.height });
    });
    return () => { cancelled = true; };
  }, [doc, pageNumber]);

  const scale = naturalSize ? THUMB_W / naturalSize.w : 1;
  const h = naturalSize ? Math.round(naturalSize.h * scale) : THUMB_W * 1.414;

  return (
    <div style={{ background: style.tint, border: `1px solid ${style.accent ?? 'var(--border)'}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, width: 'fit-content' }}>
      <div style={{ width: THUMB_W, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', opacity: entry.status === 'removed' ? 0.55 : 1, filter: entry.status === 'removed' ? 'grayscale(1)' : undefined }}>
        {doc && naturalSize && <PdfPageCanvas doc={doc} pageNumber={pageNumber} scale={scale} style={{ display: 'block' }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>
          {entry.status === 'removed' ? `Was page ${entry.oldPageNumber}` : `Page ${entry.newPageNumber}`}
        </span>
        {style.label && <Badge variant={entry.status === 'removed' ? 'error' : entry.status === 'added' ? 'info' : entry.status === 'moved' ? 'gray' : 'warning'}
          style={{ fontSize: 9.5, padding: '1px 6px', ...(entry.status === 'moved' ? { background: 'var(--purple-l)', color: 'var(--purple)' } : {}) }}>{style.label}</Badge>}
      </div>
      {entry.status === 'modified' && entry.oldText !== undefined && entry.newText !== undefined && (
        <WordDiff oldText={entry.oldText} newText={entry.newText} />
      )}
    </div>
  );
}

function VersionDiffView({ envelopeId, current, previous }: { envelopeId: string; current: VersionListItem; previous: VersionListItem | null }) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [previousSrc, setPreviousSrc] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);

  useEffect(() => {
    setLoadingSources(true);
    Promise.all([
      apiFetch(`/v1/sign/envelopes/${envelopeId}/versions/${current.id}`).then(r => r.data.document_data as string),
      previous ? apiFetch(`/v1/sign/envelopes/${envelopeId}/versions/${previous.id}`).then(r => r.data.document_data as string) : Promise.resolve(null),
    ]).then(([c, p]) => { setCurrentSrc(c); setPreviousSrc(p); setLoadingSources(false); })
      .catch(() => setLoadingSources(false));
  }, [envelopeId, current.id, previous?.id]);

  const { doc: newDoc, loading: newLoading } = usePdfDocument(currentSrc);
  const { doc: oldDoc, loading: oldLoading } = usePdfDocument(previousSrc);

  const [entries, setEntries] = useState<PageDiffEntry[] | null>(null);
  useEffect(() => {
    setEntries(null);
    if (!newDoc) return;
    if (!previous || !oldDoc) {
      // No predecessor (this is version 1) — every page is simply "new".
      extractPageTexts(newDoc).then(pages => setEntries(pages.map(p => ({ status: 'added' as const, newPageNumber: p.pageNumber, newText: p.text }))));
      return;
    }
    Promise.all([extractPageTexts(oldDoc), extractPageTexts(newDoc)]).then(([oldPages, newPages]) => {
      setEntries(computePageDiff(oldPages, newPages));
    });
  }, [newDoc, oldDoc, previous]);

  const busy = loadingSources || newLoading || (previous ? oldLoading : false) || !entries;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
        {previous ? `Changes since version ${previous.version_number}` : 'Initial version'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 18 }}>{current.change_summary}</div>
      {busy ? (
        <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, marginTop: 60 }}>Comparing pages…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${THUMB_W + 32}px, 1fr))`, justifyItems: 'center', gap: 18 }}>
          {entries!.map((entry, i) => <DiffPageCard key={i} entry={entry} oldDoc={oldDoc} newDoc={newDoc} />)}
        </div>
      )}
    </div>
  );
}

export function VersionHistoryPanel({ envelopeId, onRestore, onClose }: {
  envelopeId: string;
  onRestore: (documentData: string, fileName: string | null) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<VersionListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    apiFetch(`/v1/sign/envelopes/${envelopeId}/versions`).then(r => {
      setVersions(r.data);
      if (r.data.length) setSelectedId(r.data[0].id);
    }).catch(() => setVersions([]));
  }, [envelopeId]);

  const selected = versions?.find(v => v.id === selectedId) ?? null;
  const selectedIdx = versions && selected ? versions.indexOf(selected) : -1;
  const previous = versions && selectedIdx >= 0 ? (versions[selectedIdx + 1] ?? null) : null;
  const isLatest = versions && versions.length > 0 && selected?.id === versions[0].id;

  async function handleRestore() {
    if (!selected) return;
    if (!(await showConfirm(`This replaces the current working document with version ${selected.version_number}. This itself will be recorded as a new version, so nothing already saved is lost.`, { title: `Revert to version ${selected.version_number}?`, confirmLabel: 'Revert' }))) return;
    setRestoring(true);
    try {
      const res = await apiFetch(`/v1/sign/envelopes/${envelopeId}/versions/${selected.id}/restore`, { method: 'POST' });
      onRestore(res.data.envelope.document_data, res.data.envelope.file_name);
      showAlert(`Reverted to version ${selected.version_number}.`, { variant: 'success' });
      onClose();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not revert to that version.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--white)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Icon name="clock" size={16} style={{ color: 'var(--teal)' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Version History</span>
        <Button variant="outline" size="sm" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</Button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* LEFT: version list */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {versions === null ? (
            <SectionLoading />
          ) : versions.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, marginTop: 40 }}>No saved versions yet.</div>
          ) : versions.map(v => (
            <button key={v.id} type="button" onClick={() => setSelectedId(v.id)}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1px solid ${v.id === selectedId ? 'var(--teal)' : 'var(--border)'}`,
                background: v.id === selectedId ? 'var(--teal-l)' : 'var(--card-bg)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>
                  {v.created_by_name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.created_by_name}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{v.change_summary}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>
                v{v.version_number} · {new Date(v.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          ))}
        </div>

        {/* RIGHT: diff view + restore action */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selected ? (
            <>
              <VersionDiffView envelopeId={envelopeId} current={selected} previous={previous} />
              {!isLatest && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                  <Button variant="default" onClick={handleRestore} disabled={restoring}>
                    {restoring ? 'Reverting…' : `Revert to version ${selected.version_number}`}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              Select a version to see what changed.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
