// ─── PdfPageOrganizer.tsx — visual drag-and-drop page organizer ───────────
// Modeled on iLovePDF's "Organize PDF" tool at the user's own request: real
// page thumbnails (pdf.js — the same rendering PdfPageCanvas/
// PdfThumbnailRail already use in Cloud's Lightbox), drag-and-drop
// reordering, per-page removal, and combining in pages from another
// document. No new backend endpoints — this orchestrates the Stirling-PDF
// /merge and /reorder routes SignEditor's other PDF Tools already use.
// Verified live before building this: /reorder's CUSTOM order accepts an
// explicit *subset* of the original page numbers and both reorders AND
// drops whatever's omitted in one call — so "combine + reorder + delete"
// reduces to "merge (if >1 source), then one reorder call with the final
// page list," not three separate operations.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { usePdfDocument } from '../cloud/lib/usePdfDocument.js';
import { PdfPageCanvas } from '../cloud/components/PdfPageCanvas.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Tip } from '../../components/ui/tooltip.js';
import { showAlert } from '../../lib/alert.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { apiFetchBlob } from '../../lib/api.js';

interface SourceDoc { doc: PDFDocumentProxy; blob: Blob; fileName: string; }
// naturalWidth/naturalHeight are THIS page's own real point-size (pdf.js
// scale:1 viewport), fetched per page rather than assumed from page 1 —
// a real multi-source or scanned document routinely mixes page sizes and
// orientations (a landscape flyer next to portrait forms, a scanned form
// at a different physical size than a generated page), and reusing one
// page's proportions for a whole document distorted every page that
// didn't happen to match it. Every thumbnail's pdf.js `scale` is computed
// from its own page's real size so it renders at genuine proportions to
// begin with, not a fixed fraction squashed or stretched afterward by CSS.
interface PageItem { id: string; sourceIndex: number; pageNumber: number; naturalWidth: number; naturalHeight: number; deleted: boolean; }

// "Moved" means genuinely out of place relative to its *own document's*
// other pages, not merely "at a different array index than before" — an
// earlier version flagged *every* original page once anything was inserted
// or dragged among them, since splicing one page in front of the rest
// shifts every later page's raw index even though nothing was done to
// them. The real signal, computed independently per source document, is
// the longest increasing run of that source's page numbers in their
// current relative order: pages inside that run are still in correct
// relative sequence (not moved, however far their literal index drifted
// from insertions elsewhere); only the pages that actually broke sequence
// — genuinely dragged out of order — fall outside it. Running this per
// source (not just source 0) is what lets an *added* document's own pages
// also be flagged moved if they get dragged out of order among themselves,
// which is the "added AND moved" compound state.
function findMovedPageIds(pages: PageItem[]): Set<string> {
  const bySource = new Map<number, PageItem[]>();
  for (const p of pages) {
    if (p.deleted) continue; // a deleted page's position no longer means anything
    const list = bySource.get(p.sourceIndex);
    if (list) list.push(p); else bySource.set(p.sourceIndex, [p]);
  }
  const moved = new Set<string>();
  for (const list of bySource.values()) {
    const n = list.length;
    const dp = new Array(n).fill(1);
    const prev = new Array(n).fill(-1);
    let bestEnd = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        if (list[j].pageNumber < list[i].pageNumber && dp[j] + 1 > dp[i]) {
          dp[i] = dp[j] + 1;
          prev[i] = j;
        }
      }
      if (dp[i] > dp[bestEnd]) bestEnd = i;
    }
    const inSequence = new Array(n).fill(false);
    for (let k = bestEnd; k !== -1; k = prev[k]) inSequence[k] = true;
    list.forEach((p, i) => { if (!inSequence[i]) moved.add(p.id); });
  }
  return moved;
}

// Every thumbnail renders at this same real pixel width regardless of
// which source or page it came from, so the grid stays visually even —
// height then follows naturally from that specific page's real aspect
// ratio. PdfPageCanvas sets canvas.style.width/height imperatively in its
// own effect (the actual pixel size the browser paints, not just a CSS
// hint), so a scale that produces the right size up front is what matters
// here — a max-width/height:auto override on top of that fights the
// imperative height and previously stretched thumbnails into a distorted
// rectangle instead of the page's true proportions.
const THUMB_TARGET_WIDTH = 128;

async function pageNaturalSizes(doc: PDFDocumentProxy): Promise<{ naturalWidth: number; naturalHeight: number }[]> {
  const pageNumbers = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  return Promise.all(pageNumbers.map(async n => {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    return { naturalWidth: vp.width, naturalHeight: vp.height };
  }));
}

export function PdfPageOrganizer({ documentSrc, fileName, onExport, onClose }: {
  documentSrc: string;
  fileName: string;
  onExport: (blob: Blob, summary?: string, details?: unknown) => void;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const { doc: primaryDoc, numPages: primaryNumPages, loading: primaryLoading, error: primaryError } = usePdfDocument(documentSrc);

  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  // Clicking a header pill brings matching pages to the front for review —
  // a pure display reorder (CSS `order`), never touching `pages` itself, so
  // toggling a filter can't accidentally change the document's real page
  // order. Dragging is disabled while a filter is active so a drag target's
  // visual position can't be mistaken for its real array position.
  const [activeFilter, setActiveFilter] = useState<'moved' | 'added' | 'deleted' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seed sources/pages once — the envelope's own working document is
  // always source 0. Deliberately fires only the first time primaryDoc
  // becomes available (sources.length guard), not on every re-render.
  useEffect(() => {
    if (!primaryDoc || sources.length > 0) return;
    Promise.all([fetch(documentSrc).then(r => r.blob()), pageNaturalSizes(primaryDoc)]).then(([blob, sizes]) => {
      setSources([{ doc: primaryDoc, blob, fileName }]);
      setPages(sizes.map((size, i) => ({ id: crypto.randomUUID(), sourceIndex: 0, pageNumber: i + 1, deleted: false, ...size })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryDoc, primaryNumPages]);

  async function handleAddDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAddingDoc(true);
    try {
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const sizes = await pageNaturalSizes(doc);
      const sourceIndex = sources.length;
      setSources(prev => [...prev, { doc, blob: file, fileName: file.name }]);
      setPages(prev => [...prev, ...sizes.map((size, i) => ({ id: crypto.randomUUID(), sourceIndex, pageNumber: i + 1, deleted: false, ...size }))]);
    } catch {
      showAlert("Couldn't read that file as a PDF.");
    } finally {
      setAddingDoc(false);
    }
  }

  // Soft delete — stays visible (dimmed, tagged, trackable/filterable) so a
  // deletion can be reviewed and undone before Apply, instead of the page
  // silently vanishing the moment × is clicked.
  function deletePage(id: string) {
    setPages(prev => {
      const survivingCount = prev.filter(p => !p.deleted && p.id !== id).length;
      if (survivingCount === 0) return prev; // always need at least one real page
      return prev.map(p => p.id === id ? { ...p, deleted: true } : p);
    });
  }

  function restorePage(id: string) {
    setPages(prev => prev.map(p => p.id === id ? { ...p, deleted: false } : p));
  }

  function movePage(from: number, to: number) {
    if (to < 0 || to >= pages.length || from === to) return;
    setPages(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function handleApply() {
    const survivingPages = pages.filter(p => !p.deleted);
    if (survivingPages.length === 0) { showAlert('At least one page is required.'); return; }
    setApplying(true);
    try {
      // Nothing actually changed — one source, original order, nothing
      // deleted or omitted — skip round-tripping a possibly-large PDF for
      // no reason.
      const unchanged = sources.length === 1 && pages.every(p => !p.deleted) &&
        survivingPages.length === sources[0].doc.numPages &&
        survivingPages.every((p, i) => p.sourceIndex === 0 && p.pageNumber === i + 1);
      if (unchanged) { onExport(sources[0].blob); return; }

      let mergedBlob: Blob;
      if (sources.length > 1) {
        const form = new FormData();
        for (const s of sources) form.append('file', s.blob, s.fileName);
        mergedBlob = await apiFetchBlob('/v1/sign/pdf-tools/merge', { method: 'POST', body: form });
      } else {
        mergedBlob = sources[0].blob;
      }

      // Page numbers within the merged document = each source's own
      // cumulative page offset + the page's original number. Deleted pages
      // are simply omitted from this list — the same "explicit subset
      // order drops what's left out" behavior /reorder already does.
      const offsets: number[] = [];
      let running = 0;
      for (const s of sources) { offsets.push(running); running += s.doc.numPages; }
      const order = survivingPages.map(p => offsets[p.sourceIndex] + p.pageNumber).join(',');

      const form = new FormData();
      form.append('file', mergedBlob, 'organized.pdf');
      const finalBlob = await apiFetchBlob(`/v1/sign/pdf-tools/reorder?order=${encodeURIComponent(order)}`, { method: 'POST', body: form });

      const parts: string[] = [];
      if (movedCount > 0) parts.push(`${movedCount} moved`);
      if (addedCount > 0) parts.push(`${addedCount} added`);
      if (deletedCount > 0) parts.push(`${deletedCount} deleted`);
      const summary = parts.length ? `Organized pages (${parts.join(', ')})` : 'Organized pages';
      onExport(finalBlob, summary, { tool: 'organize', movedCount, addedCount, deletedCount });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not apply your changes.');
    } finally {
      setApplying(false);
    }
  }

  const ready = sources.length > 0 && pages.length > 0;
  const addedCount = pages.filter(p => !p.deleted && p.sourceIndex !== 0).length;
  const deletedCount = pages.filter(p => p.deleted).length;
  const movedPageIds = useMemo(() => findMovedPageIds(pages), [pages]);
  const movedCount = movedPageIds.size;

  function togglePillFilter(filter: 'moved' | 'added' | 'deleted') {
    setActiveFilter(prev => prev === filter ? null : filter);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--white)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <Icon name="grid" size={16} style={{ color: 'var(--teal)' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Organize Pages</span>
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
          {pages.length - deletedCount} page{pages.length - deletedCount === 1 ? '' : 's'}{sources.length > 1 ? ` · ${sources.length} documents` : ''}
        </span>
        {movedCount > 0 && (
          <button type="button" onClick={() => togglePillFilter('moved')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <Badge variant="warning" style={activeFilter === 'moved' ? { boxShadow: '0 0 0 2px var(--gold)' } : undefined}>{movedCount} moved</Badge>
          </button>
        )}
        {addedCount > 0 && (
          <button type="button" onClick={() => togglePillFilter('added')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <Badge variant="info" style={activeFilter === 'added' ? { boxShadow: '0 0 0 2px var(--blue)' } : undefined}>{addedCount} added</Badge>
          </button>
        )}
        {deletedCount > 0 && (
          <button type="button" onClick={() => togglePillFilter('deleted')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <Badge variant="error" style={activeFilter === 'deleted' ? { boxShadow: '0 0 0 2px var(--red)' } : undefined}>{deletedCount} deleted</Badge>
          </button>
        )}
        {activeFilter && (
          <Button variant="ghost" size="xs" onClick={() => setActiveFilter(null)} style={{ color: 'var(--ink3)' }}>
            Clear filter
          </Button>
        )}

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleAddDocument} />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={addingDoc}>
            <Icon name="plus" size={13} /> {addingDoc ? 'Loading…' : 'Add Document'}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="sm" onClick={handleApply} disabled={!ready || applying}>
            {applying ? 'Applying…' : 'Apply Changes'}
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg)' }}>
        {primaryLoading || !ready ? (
          <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, marginTop: 60 }}>
            {primaryError ? "Couldn't load this document" : 'Loading pages…'}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>
              {isMobile
                ? 'Use the arrows to reorder a page, tap × to remove it, or add another document to combine.'
                : 'Drag a page to reorder it, click the × to remove it, or add another document to combine — pages from every source can be mixed in any order.'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${THUMB_TARGET_WIDTH + 32}px, 1fr))`, justifyItems: 'center', gap: 18 }}>
              {pages.map((p, i) => {
                const src = sources[p.sourceIndex];
                const thumbScale = THUMB_TARGET_WIDTH / p.naturalWidth;
                const thumbHeight = Math.round(p.naturalHeight * thumbScale);
                // Added: from a document merged in after the original.
                // Moved: genuinely out of its own document's natural page
                // sequence (see findMovedPageIds) — not just "at a
                // different array index," which every later page picks up
                // the moment anything is inserted before it. A page can be
                // both: added, then itself dragged out of order among the
                // other added pages — that gets its own third color rather
                // than silently reading as plain "Added".
                const isAdded = p.sourceIndex !== 0;
                const isMoved = movedPageIds.has(p.id);
                const isDeleted = p.deleted;
                const state: 'deleted' | 'addedMoved' | 'added' | 'moved' | 'none' =
                  isDeleted ? 'deleted' : isAdded && isMoved ? 'addedMoved' : isAdded ? 'added' : isMoved ? 'moved' : 'none';
                const accent = { deleted: 'var(--red)', addedMoved: 'var(--purple)', added: 'var(--blue)', moved: 'var(--gold)', none: null }[state];
                const accentTint = { deleted: 'var(--red-l)', addedMoved: 'var(--purple-l)', added: 'var(--blue-l)', moved: 'var(--gold-l)', none: 'var(--card-bg)' }[state];
                const badgeLabel = { deleted: 'Deleted', addedMoved: 'Added + Moved', added: 'Added', moved: 'Moved', none: null }[state];
                // A clicked filter pill brings its matching pages to the
                // front for review via pure CSS reflow (`order`) — pages.
                // itself, and every index derived from it, stays untouched.
                const matchesFilter = activeFilter === 'deleted' ? isDeleted
                  : activeFilter === 'added' ? (isAdded && !isDeleted)
                  : activeFilter === 'moved' ? (isMoved && !isDeleted)
                  : true;
                const dragDisabled = isMobile || activeFilter !== null;
                return (
                  <div key={p.id}
                    data-testid="page-organizer-card"
                    draggable={!dragDisabled}
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => { if (dragIndex !== null) movePage(dragIndex, i); setDragIndex(null); }}
                    onDragEnd={() => setDragIndex(null)}
                    style={{
                      background: accentTint, border: `1px solid ${dragIndex === i ? 'var(--teal)' : accent ?? 'var(--border)'}`, borderRadius: 10,
                      padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative', width: 'fit-content',
                      cursor: dragDisabled ? 'default' : 'grab', opacity: dragIndex === i ? 0.5 : matchesFilter ? 1 : 0.45,
                      order: matchesFilter ? 0 : 1, transition: 'opacity 0.1s, border-color 0.1s',
                    }}
                  >
                    {isDeleted ? (
                      <Tip label="Restore this page">
                        <button type="button" onClick={() => restorePage(p.id)}
                          style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'var(--green-l)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}>
                          <Icon name="refresh" size={12} />
                        </button>
                      </Tip>
                    ) : (
                      <button type="button" onClick={() => deletePage(p.id)} title="Remove this page"
                        style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'var(--sign-red-l)', color: 'var(--sign-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}>
                        <Icon name="x" size={12} />
                      </button>
                    )}
                    <div style={{ width: THUMB_TARGET_WIDTH, height: thumbHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', filter: isDeleted ? 'grayscale(1)' : undefined, opacity: isDeleted ? 0.5 : 1 }}>
                      <PdfPageCanvas doc={src.doc} pageNumber={p.pageNumber} scale={thumbScale} style={{ display: 'block' }} />
                    </div>
                    {badgeLabel && (
                      <Badge variant={state === 'deleted' ? 'error' : state === 'added' ? 'info' : state === 'moved' ? 'warning' : 'gray'}
                        style={{ alignSelf: 'flex-start', fontSize: 10, padding: '1px 6px', ...(state === 'addedMoved' ? { background: 'var(--purple-l)', color: 'var(--purple)' } : {}) }}>
                        {badgeLabel}
                      </Badge>
                    )}
                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', textDecoration: isDeleted ? 'line-through' : 'none' }}>
                      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{i + 1}</span>
                      {sources.length > 1 && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{src.fileName}</span>}
                    </div>
                    {isMobile && !isDeleted && (
                      <div style={{ width: '100%', display: 'flex', gap: 6 }}>
                        <Button variant="outline" size="xs" onClick={() => movePage(i, i - 1)} disabled={i === 0} style={{ flex: 1 }}>
                          <Icon name="chevronLeft" size={12} />
                        </Button>
                        <Button variant="outline" size="xs" onClick={() => movePage(i, i + 1)} disabled={i === pages.length - 1} style={{ flex: 1 }}>
                          <Icon name="chevronRight" size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
