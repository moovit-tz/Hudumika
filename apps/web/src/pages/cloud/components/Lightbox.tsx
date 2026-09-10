import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/Icon.js';
import { apiFetchBlob } from '../../../lib/api.js';
import { Dialog, DialogContent } from '../../../components/ui/dialog.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { previewKind, fileTypeStyle } from '../lib/fileTypeStyle.js';
import { usePreviewBlob } from '../lib/usePreviewBlob.js';
import { usePdfDocument } from '../lib/usePdfDocument.js';
import { DocThumbnail } from './DocThumbnail.js';
import { PdfPageCanvas } from './PdfPageCanvas.js';
import { PdfThumbnailRail } from './PdfThumbnailRail.js';

/**
 * Full-screen document viewer modal.
 *
 * PDFs used to be handed to a plain `<iframe src={blobUrl}>` — whatever the
 * browser's own built-in PDF plugin does with it, which has no page count,
 * no page thumbnails, and no way for the rest of this component to know
 * which page is showing. The surrounding "page" was also just a 100%×100%
 * stretch of the viewer area regardless of the document's real proportions,
 * so a portrait page got distorted into whatever rectangle happened to be
 * available. Both are replaced here with a real pdf.js render: an actual
 * per-page `<canvas>` at the document's own aspect ratio, a left rail of
 * real (lazily-rendered) page thumbnails, and working Page X/Y navigation —
 * this is the piece "should be like Google Drive" was actually pointing at.
 * Images keep their own aspect ratio too (`max-width/max-height` +
 * `object-fit`, not a forced square stretch).
 */
export function Lightbox({ item, onClose, onDownload, onShare, onStar }: {
  item: CloudFile;
  onClose: () => void;
  onDownload: (item: CloudFile) => void;
  onShare: (item: CloudFile) => void;
  onStar: (item: CloudFile) => void;
}) {
  const navigate = useNavigate();
  const kind = previewKind(item.type);
  const { url, loading, error } = usePreviewBlob(kind ? item.id : null);

  const [zoom, setZoom] = useState(100);

  const isPdf = kind === 'pdf';
  const isImage = kind === 'image';
  const ext = (item.type || '').toLowerCase();
  const isText = ['txt', 'text', 'log', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'ini', 'conf'].includes(ext);
  const isOffice = ['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'].includes(ext);
  const isSheet = ['xlsx', 'xls', 'csv'].includes(item.type) || item.name.endsWith('.xlsx');

  // ── Text / CSV: render the real content inline (no dependency) ──
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textErr, setTextErr] = useState(false);
  useEffect(() => {
    if (!isText) { setTextBody(null); return; }
    let cancelled = false;
    setTextBody(null); setTextErr(false);
    apiFetchBlob(`/v1/files/${item.id}/preview`)
      .then(b => b.text())
      .then(t => { if (!cancelled) setTextBody(t.slice(0, 500_000)); })
      .catch(() => { if (!cancelled) setTextErr(true); });
    return () => { cancelled = true; };
  }, [isText, item.id]);

  const csvRows = useMemo(() => {
    if (!textBody || (ext !== 'csv' && ext !== 'tsv')) return null;
    const sep = ext === 'tsv' ? '\t' : ',';
    return textBody.split(/\r?\n/).slice(0, 500).filter(l => l.length).map(line => {
      // minimal CSV: handles quoted fields with embedded separators
      const out: string[] = []; let cur = ''; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
        else if (c === '"') q = true;
        else if (c === sep) { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur);
      return out;
    });
  }, [textBody, ext]);

  // ── Office docs: server converts to PDF when LibreOffice is configured;
  //    otherwise an honest "download to view". ──
  const [officePdfUrl, setOfficePdfUrl] = useState<string | null>(null);
  const [officeState, setOfficeState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  useEffect(() => {
    if (!isOffice) return;
    let cancelled = false;
    let objUrl: string | null = null;
    setOfficeState('loading'); setOfficePdfUrl(null);
    apiFetchBlob(`/v1/files/${item.id}/preview`)
      .then(blob => {
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        setOfficePdfUrl(objUrl);
        setOfficeState('ready');
      })
      .catch((e: any) => {
        if (cancelled) return;
        setOfficeState(String(e?.message || '').includes('PREVIEW_UNAVAILABLE') ? 'unavailable' : 'error');
      });
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [isOffice, item.id]);

  // Badge config per file type
  const badgeConfig = isPdf
    ? { label: 'PDF', bg: '#ef4444', text: '#fff' }
    : isSheet
    ? { label: 'Sheet', bg: '#10b981', text: '#fff' }
    : isImage
    ? { label: 'Image', bg: '#8b5cf6', text: '#fff' }
    : { label: 'Doc', bg: '#3b82f6', text: '#fff' };

  // ── Real PDF pagination ──
  const { doc: pdfDoc, numPages, loading: pdfLoading, error: pdfError } = usePdfDocument(isPdf ? url : null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [naturalPageSize, setNaturalPageSize] = useState<{ width: number; height: number } | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const docAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrentPage(1); setPageInput('1'); setNaturalPageSize(null); }, [pdfDoc]);
  useEffect(() => { setPageInput(String(currentPage)); }, [currentPage]);

  // Page 1's own real (unscaled) size — used below as the "100% zoom" baseline.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    pdfDoc.getPage(1).then(page => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: 1 });
      setNaturalPageSize({ width: vp.width, height: vp.height });
    });
    return () => { cancelled = true; };
  }, [pdfDoc]);

  // "100%" means "fills the real available area" (this is exactly the bug
  // this viewer had before — a hardcoded 740×920 box that never actually
  // meant 100%), computed here as min(fit-width, fit-height) against the
  // page's real proportions rather than a stretch that would distort them.
  useEffect(() => {
    const el = docAreaRef.current;
    if (!el || !naturalPageSize) return;
    function recompute() {
      const cs = getComputedStyle(el as HTMLDivElement);
      const availW = (el as HTMLDivElement).clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = (el as HTMLDivElement).clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const scale = Math.min(availW / naturalPageSize!.width, availH / naturalPageSize!.height);
      setFitScale(scale > 0 && Number.isFinite(scale) ? scale : 1);
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalPageSize]);

  function goToPage(n: number) {
    const clamped = Math.max(1, Math.min(numPages || 1, n));
    setCurrentPage(clamped);
  }
  function commitPageInput() {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n)) goToPage(n); else setPageInput(String(currentPage));
  }

  function openInSign() {
    onClose();
    navigate(`/sign/editor?fileId=${item.id}&fileName=${encodeURIComponent(item.name)}`);
  }

  const showLoading = loading || (isPdf && pdfLoading) || (isOffice && officeState === 'loading') || (isText && textBody == null && !textErr);
  const showError = !showLoading && ((kind && error) || (isPdf && pdfError) || (isOffice && officeState === 'error') || (isText && textErr));
  const pdfRenderScale = fitScale * (zoom / 100);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        hideClose
        className="max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh] p-0 flex flex-col overflow-hidden border-none rounded-none duration-300"
        style={{
          background: '#0c0f1a',
          ['--tw-enter-scale' as any]: '1',
          ['--tw-enter-translate-x' as any]: '0',
          ['--tw-enter-translate-y' as any]: '0',
          ['--tw-exit-scale' as any]: '1',
          ['--tw-exit-translate-x' as any]: '0',
          ['--tw-exit-translate-y' as any]: '0',
        }}
      >

        {/* ── Top bar ─────────────────────────────────────────────── */}
        <div className="lbx-bar">
          {/* Left: badge + filename */}
          <div className="lbx-bar-left">
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: badgeConfig.bg, color: badgeConfig.text, flexShrink: 0 }}>
              <Icon name={fileTypeStyle(item.type).icon} size={14} />
            </span>
            <span className="lbx-filename">{item.name}</span>
          </div>

          {/* Center: page nav + zoom (PDF only) */}
          <div className="lbx-bar-center">
            {isPdf && pdfDoc && numPages > 0 && (
              <div className="lbx-pill">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  title="Previous page"
                  className="lbx-icon-btn"
                  style={{ opacity: currentPage <= 1 ? 0.35 : 1 }}
                >
                  <Icon name="chevronLeft" size={14} />
                </button>
                <input
                  value={pageInput}
                  onChange={e => setPageInput(e.target.value.replace(/[^\d]/g, ''))}
                  onBlur={commitPageInput}
                  onKeyDown={e => { if (e.key === 'Enter') { commitPageInput(); (e.target as HTMLInputElement).blur(); } }}
                  className="lbx-page-input"
                />
                <span className="lbx-page-sep">/ {numPages}</span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= numPages}
                  title="Next page"
                  className="lbx-icon-btn"
                  style={{ opacity: currentPage >= numPages ? 0.35 : 1 }}
                >
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
            )}

            <div className="lbx-pill">
              <button onClick={() => setZoom(z => Math.max(50, z - 10))} title="Zoom out" className="lbx-icon-btn lbx-zoom-btn">
                <Icon name="minus" size={13} />
              </button>
              <span className="lbx-zoom-label">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(200, z + 10))} title="Zoom in" className="lbx-icon-btn lbx-zoom-btn">
                <Icon name="plus" size={13} />
              </button>
            </div>
          </div>

          {/* Right: actions */}
          <div className="lbx-bar-right">
            <button onClick={() => window.print()} title="Print" className="lbx-icon-btn lbx-action-btn">
              <Icon name="printer" size={15} />
            </button>
            <button onClick={() => onDownload(item)} title="Download" className="lbx-icon-btn lbx-action-btn">
              <Icon name="download" size={15} />
            </button>

            <div className="lbx-divider" />

            <button
              onClick={() => onStar(item)}
              title={item.starred ? 'Unstar' : 'Star'}
              className="lbx-icon-btn lbx-action-btn"
              style={{ color: item.starred ? '#f59e0b' : undefined }}
            >
              <Icon name="star" size={15} color={item.starred ? '#f59e0b' : undefined} />
            </button>
            <button onClick={() => onShare(item)} title="Share" className="lbx-icon-btn lbx-action-btn">
              <Icon name="userPlus" size={15} />
            </button>

            <div className="lbx-divider" />

            {/* Send this real file straight into a real signing workflow —
                /v1/sign/envelopes.file_id is a real FK to cloud_files, so the
                editor opens with this exact document loaded, not a re-upload. */}
            <button onClick={openInSign} title="Sign & Stamp" className="lbx-sign-btn">
              <Icon name="stamp" size={14} color="#fff" />
              <span>Sign &amp; Stamp</span>
            </button>

            <div className="lbx-divider" />

            <button onClick={onClose} title="Close viewer" className="lbx-icon-btn lbx-close-btn">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        {/* Body — real page thumbnail rail (PDF only) + the document itself. */}
        <div className="lightbox-body">
          {isPdf && pdfDoc && numPages > 0 && (
            <PdfThumbnailRail doc={pdfDoc} numPages={numPages} currentPage={currentPage} onSelect={goToPage} />
          )}

          <div className="lightbox-doc-area" ref={docAreaRef}>
            {isPdf && numPages > 1 && (
              <>
                <button
                  className="lightbox-edge-nav lightbox-edge-nav--left"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  title="Previous page"
                >
                  <Icon name="chevronLeft" size={20} color="#e5e7eb" />
                </button>
                <button
                  className="lightbox-edge-nav lightbox-edge-nav--right"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= numPages}
                  title="Next page"
                >
                  <Icon name="chevronRight" size={20} color="#e5e7eb" />
                </button>
              </>
            )}

            {showLoading && (
              <div className="lbx-status">
                <div className="lbx-status-spinner" />
                <span>Loading preview…</span>
              </div>
            )}
            {showError && (
              <div className="lbx-status lbx-status--error">
                <Icon name="alertCircle" size={24} />
                <span>Couldn't load a preview for this file.</span>
              </div>
            )}

            {!showLoading && !showError && isPdf && pdfDoc && (
              <PdfPageCanvas
                doc={pdfDoc}
                pageNumber={currentPage}
                scale={pdfRenderScale}
                className="lightbox-pdf-canvas"
              />
            )}

            {!showLoading && !showError && isImage && url && (
              <img src={url} alt={item.name} className="lightbox-image" style={{ transform: `scale(${zoom / 100})` }} />
            )}

            {/* Office doc converted server-side to PDF (LibreOffice) */}
            {!showLoading && !showError && isOffice && officeState === 'ready' && officePdfUrl && (
              <iframe src={officePdfUrl} title={item.name}
                style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
            )}

            {/* Office doc, no converter configured — honest fallback */}
            {!showLoading && !showError && isOffice && officeState === 'unavailable' && (
              <div className="lbx-status">
                <Icon name="fileText" size={28} />
                <span>Inline preview isn't available for {ext.toUpperCase()} files on this deployment.</span>
                <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => onDownload(item)}>Download to view</button>
              </div>
            )}

            {/* Text / CSV rendered inline */}
            {!showLoading && !showError && isText && textBody != null && (
              csvRows ? (
                <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#fff' }}>
                  <table className="lbx-csv-table" style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
                    <tbody>
                      {csvRows.map((r, ri) => (
                        <tr key={ri}>
                          {r.map((c, ci) => (
                            ri === 0
                              ? <th key={ci} style={{ border: '1px solid #e2e8f0', padding: '5px 9px', background: '#f8fafc', textAlign: 'left', position: 'sticky', top: 0 }}>{c}</th>
                              : <td key={ci} style={{ border: '1px solid #e2e8f0', padding: '5px 9px' }}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre style={{
                  width: '100%', height: '100%', overflow: 'auto', margin: 0, padding: 20,
                  background: '#fff', color: '#1e293b', fontSize: 12.5, lineHeight: 1.6,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{textBody}</pre>
              )
            )}

            {!showLoading && !showError && !isPdf && !isImage && !isOffice && !isText && (
              <div className="lightbox-doc-sheet" style={{ transform: `scale(${zoom / 100})` }}>
                <DocThumbnail type={item.type} name={item.name} url={url} />
              </div>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
