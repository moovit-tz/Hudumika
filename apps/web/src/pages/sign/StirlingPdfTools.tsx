// ─── StirlingPdfTools.tsx — Optional Stirling-PDF integration modal ──────────
// Renders inside SignEditor.tsx when the user clicks "PDF Tools".
// Integrates with an admin-configured Stirling-PDF container over HTTP;
// disabled gracefully with setup instructions if no base URL is set.
//
// Two output shapes, per tool (see `outputMode` below): most tools return a
// PDF, which replaces the envelope's working document exactly like the
// original rotate/watermark/redact/OCR/compress tools always have; a second
// group (split/extract/convert-to-office) returns a real *different* file
// (a ZIP, an .xlsx/.docx/.pptx/.txt) that gets downloaded instead — loading
// a spreadsheet into the PDF preview as if it were the new working document
// would be wrong, not just unpolished.
import React, { useEffect, useState } from 'react';
import { apiFetch, apiFetchBlob } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { showAlert } from '../../lib/alert.js';
import { useAuth } from '../../hooks/useAuth.js';
import { PdfPageOrganizer } from './PdfPageOrganizer.js';

interface StirlingPdfToolsProps {
  documentSrc: string;
  fileName: string;
  /** summary/details, when given, become this change's Version History
   *  entry the next time the envelope is saved — a real, tool-specific
   *  description (e.g. "Rotated 90°"), not a generic "document edited". */
  onExport: (blob: Blob, summary?: string, details?: unknown) => void;
  onClose: () => void;
  /** Renders in-flow to fill its parent (SignEditor.tsx's right-hand panel,
   *  swapped in for Field Properties while a tool is active) instead of the
   *  default fixed full-screen overlay. Same component either way — only
   *  the outer chrome/spacing changes, so the two call sites can't drift. */
  embedded?: boolean;
}

type ToolKey =
  | 'organize'
  | 'rotate' | 'crop' | 'delete-pages' | 'reorder' | 'n-up' | 'resize' | 'bookmarks' | 'page-numbers'
  | 'watermark' | 'redact' | 'metadata' | 'flatten' | 'repair'
  | 'protect' | 'unlock'
  | 'split-pages' | 'split-chapters' | 'split-size' | 'extract-images' | 'to-images'
  | 'to-excel' | 'to-word' | 'to-powerpoint' | 'to-text'
  | 'compress' | 'ocr';

interface ToolDef {
  key: ToolKey; label: string; icon: IconName; desc: string; category: string;
  // 'organizer' opens PdfPageOrganizer's own full drag-and-drop screen
  // instead of the usual "pick a config, click Run" flow below — reorder/
  // delete/combine genuinely needs a visual surface, not a form.
  outputMode: 'replace' | 'download' | 'organizer';
  downloadName?: string;
}

const TOOLS: ToolDef[] = [
  // Pages
  { key: 'organize',     label: 'Organize Pages',      icon: 'grid',       desc: 'Drag to reorder, remove, or combine pages visually.', category: 'Pages', outputMode: 'organizer' },
  { key: 'rotate',       label: 'Rotate',              icon: 'refresh',    desc: 'Rotate every page by a fixed angle.', category: 'Pages', outputMode: 'replace' },
  { key: 'crop',         label: 'Crop',                icon: 'scan',       desc: 'Trim every page to a fixed box.', category: 'Pages', outputMode: 'replace' },
  { key: 'delete-pages', label: 'Delete Pages',        icon: 'trash',      desc: 'Remove specific pages from the document.', category: 'Pages', outputMode: 'replace' },
  { key: 'reorder',      label: 'Reorder Pages',       icon: 'arrowUpDown', desc: 'Set a new page order.', category: 'Pages', outputMode: 'replace' },
  { key: 'n-up',         label: 'N-up Layout',         icon: 'grid',       desc: 'Fit multiple pages onto one sheet.', category: 'Pages', outputMode: 'replace' },
  { key: 'resize',       label: 'Resize',              icon: 'maximize',   desc: 'Scale every page to a standard size.', category: 'Pages', outputMode: 'replace' },
  { key: 'bookmarks',    label: 'Add Bookmarks',       icon: 'bookmark',   desc: 'Add a table-of-contents outline.', category: 'Pages', outputMode: 'replace' },
  { key: 'page-numbers', label: 'Page Numbers',        icon: 'hash',       desc: 'Stamp page numbers onto every page.', category: 'Pages', outputMode: 'replace' },
  // Content
  { key: 'watermark',    label: 'Add Watermark',       icon: 'stamp',      desc: 'Stamp repeating text across every page.', category: 'Content', outputMode: 'replace' },
  { key: 'redact',       label: 'Auto-Redact',         icon: 'eyeOff',     desc: 'Find and permanently black out matching text.', category: 'Content', outputMode: 'replace' },
  { key: 'metadata',     label: 'Edit Metadata',       icon: 'fileText',   desc: 'Set the document title, author, subject.', category: 'Content', outputMode: 'replace' },
  { key: 'flatten',      label: 'Flatten',             icon: 'layers',     desc: 'Lock form fields and annotations in place.', category: 'Content', outputMode: 'replace' },
  { key: 'repair',       label: 'Repair',              icon: 'tool',       desc: 'Attempt to fix a corrupted PDF.', category: 'Content', outputMode: 'replace' },
  // Security
  { key: 'protect',      label: 'Protect (Add Password)', icon: 'lock',    desc: 'Require a password to open the document.', category: 'Security', outputMode: 'replace' },
  { key: 'unlock',       label: 'Unlock (Remove Password)', icon: 'unlock', desc: 'Remove an existing password.', category: 'Security', outputMode: 'replace' },
  // Split & Extract
  { key: 'split-pages',    label: 'Split by Pages',    icon: 'columns',   desc: 'Split after specific page numbers.', category: 'Split & Extract', outputMode: 'download', downloadName: 'split.zip' },
  { key: 'split-chapters', label: 'Split by Bookmarks', icon: 'columns',  desc: 'Split at each top-level bookmark.', category: 'Split & Extract', outputMode: 'download', downloadName: 'split-by-chapters.zip' },
  { key: 'split-size',     label: 'Split by Size',     icon: 'columns',   desc: 'Split into parts under a target file size.', category: 'Split & Extract', outputMode: 'download', downloadName: 'split-by-size.zip' },
  { key: 'extract-images',  label: 'Extract Images',   icon: 'image',      desc: 'Pull every embedded image out as files.', category: 'Split & Extract', outputMode: 'download', downloadName: 'images.zip' },
  { key: 'to-images',       label: 'PDF to Images',    icon: 'image',      desc: 'Render every page as an image.', category: 'Split & Extract', outputMode: 'download', downloadName: 'pages.zip' },
  // Convert
  { key: 'to-excel',      label: 'PDF to Excel',       icon: 'fileText',   desc: 'Extract tables into a spreadsheet.', category: 'Convert', outputMode: 'download', downloadName: 'document.xlsx' },
  { key: 'to-word',       label: 'PDF to Word',        icon: 'fileText',   desc: 'Convert to an editable .docx.', category: 'Convert', outputMode: 'download', downloadName: 'document.docx' },
  { key: 'to-powerpoint', label: 'PDF to PowerPoint',  icon: 'fileText',   desc: 'Convert to an editable .pptx.', category: 'Convert', outputMode: 'download', downloadName: 'document.pptx' },
  { key: 'to-text',       label: 'PDF to Text',        icon: 'fileText',   desc: 'Extract the raw text content.', category: 'Convert', outputMode: 'download', downloadName: 'document.txt' },
  // Optimize
  { key: 'ocr',       label: 'OCR',      icon: 'search',  desc: 'Make a scanned PDF searchable.', category: 'Optimize', outputMode: 'replace' },
  { key: 'compress',  label: 'Compress', icon: 'archive', desc: 'Shrink file size before sending.', category: 'Optimize', outputMode: 'replace' },
];
const CATEGORIES = ['Pages', 'Content', 'Security', 'Split & Extract', 'Convert', 'Optimize'];

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export function StirlingPdfTools({ documentSrc, fileName, onExport, onClose, embedded }: StirlingPdfToolsProps) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [baseUrl, setBaseUrl] = useState<string | null | undefined>(undefined); // undefined = still loading
  const [urlDraft, setUrlDraft] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [running, setRunning] = useState(false);
  const [showOrganizer, setShowOrganizer] = useState(false);

  // Pages
  const [angle, setAngle] = useState('90');
  const [cropBox, setCropBox] = useState({ x: '0', y: '0', width: '400', height: '600' });
  const [deletePages, setDeletePages] = useState('');
  const [reorderPages, setReorderPages] = useState('');
  const [pagesPerSheet, setPagesPerSheet] = useState('2');
  const [resizeSize, setResizeSize] = useState('A4');
  const [bookmarks, setBookmarks] = useState<{ title: string; pageNumber: string }[]>([{ title: '', pageNumber: '1' }]);
  const [pageNumStart, setPageNumStart] = useState('1');
  const [pageNumText, setPageNumText] = useState('{n}');
  // Content
  const [watermarkText, setWatermarkText] = useState('');
  const [redactTerms, setRedactTerms] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaAuthor, setMetaAuthor] = useState('');
  const [metaSubject, setMetaSubject] = useState('');
  const [flattenFormsOnly, setFlattenFormsOnly] = useState(false);
  // Security
  const [protectPassword, setProtectPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  // Split & Extract
  const [splitAfterPages, setSplitAfterPages] = useState('');
  const [splitBookmarkLevel, setSplitBookmarkLevel] = useState('1');
  const [splitSize, setSplitSize] = useState('10MB');
  const [imageFormat, setImageFormat] = useState('png');
  // Optimize
  const [ocrLang, setOcrLang] = useState('eng');
  const [compressLevel, setCompressLevel] = useState('5');

  useEffect(() => {
    apiFetch('/v1/platform/stirling-pdf').then((d: any) => setBaseUrl(d?.baseUrl ?? null)).catch(() => setBaseUrl(null));
  }, []);

  async function saveBaseUrl() {
    if (!urlDraft.trim()) return;
    setSavingUrl(true);
    try {
      const res = await apiFetch('/v1/platform/stirling-pdf', { method: 'PUT', body: JSON.stringify({ baseUrl: urlDraft.trim() }) });
      setBaseUrl(res.baseUrl);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save the Stirling-PDF base URL.');
    } finally {
      setSavingUrl(false);
    }
  }

  function fail(msg: string) { showAlert(msg); setRunning(false); }

  // A real, tool-specific description for Version History — reflects the
  // actual parameters just used, not a generic "document edited".
  function buildToolSummary(tool: ToolDef): string {
    switch (tool.key) {
      case 'rotate': return `Rotated ${angle}°`;
      case 'crop': return 'Cropped';
      case 'delete-pages': return `Deleted page(s) ${deletePages}`;
      case 'reorder': return 'Reordered pages';
      case 'n-up': return `${pagesPerSheet}-up layout`;
      case 'resize': return `Resized to ${resizeSize}`;
      case 'bookmarks': return 'Added bookmarks';
      case 'page-numbers': return 'Added page numbers';
      case 'watermark': return `Added watermark "${watermarkText}"`;
      case 'redact': return 'Redacted matching text';
      case 'metadata': return 'Edited document metadata';
      case 'flatten': return 'Flattened form fields';
      case 'repair': return 'Repaired document';
      case 'protect': return 'Password-protected';
      case 'unlock': return 'Removed password';
      case 'ocr': return `OCR (${ocrLang})`;
      case 'compress': return `Compressed (level ${compressLevel})`;
      default: return tool.label;
    }
  }

  async function runTool(tool: ToolDef) {
    setRunning(true);
    try {
      const sourceBlob = await fetch(documentSrc).then(r => r.blob());
      const form = new FormData();
      form.append('file', sourceBlob, fileName);

      const q = new URLSearchParams();
      switch (tool.key) {
        case 'rotate': q.set('angle', angle); break;
        case 'crop':
          q.set('x', cropBox.x); q.set('y', cropBox.y); q.set('width', cropBox.width); q.set('height', cropBox.height);
          break;
        case 'delete-pages':
          if (!deletePages.trim()) return fail('The pages to delete are required (e.g. 2,4-6).');
          q.set('pages', deletePages.trim());
          break;
        case 'reorder':
          if (!reorderPages.trim()) return fail('The new page order is required (e.g. 3,1,2,4).');
          q.set('order', reorderPages.trim());
          break;
        case 'n-up': q.set('pagesPerSheet', pagesPerSheet); break;
        case 'resize': q.set('pageSize', resizeSize); break;
        case 'bookmarks': {
          const valid = bookmarks.filter(b => b.title.trim() && b.pageNumber.trim());
          if (!valid.length) return fail('At least one bookmark (title + page number) is required.');
          q.set('bookmarks', JSON.stringify(valid.map(b => ({ title: b.title.trim(), pageNumber: Number(b.pageNumber) }))));
          break;
        }
        case 'page-numbers':
          q.set('startingNumber', pageNumStart); q.set('customText', pageNumText || '{n}');
          break;
        case 'watermark':
          if (!watermarkText.trim()) return fail('Watermark text is required.');
          q.set('text', watermarkText.trim());
          break;
        case 'redact': {
          const terms = redactTerms.split(',').map(t => t.trim()).filter(Boolean);
          if (!terms.length) return fail('At least one search term is required.');
          q.set('terms', terms.join(','));
          break;
        }
        case 'metadata':
          q.set('title', metaTitle); q.set('author', metaAuthor); q.set('subject', metaSubject);
          break;
        case 'flatten': q.set('formsOnly', String(flattenFormsOnly)); break;
        case 'repair': break;
        case 'protect':
          if (!protectPassword.trim()) return fail('A password is required.');
          q.set('password', protectPassword.trim());
          break;
        case 'unlock':
          if (!unlockPassword.trim()) return fail('The document’s current password is required.');
          q.set('password', unlockPassword.trim());
          break;
        case 'split-pages':
          if (!splitAfterPages.trim()) return fail('The pages to split after are required (e.g. 3,7).');
          q.set('pages', splitAfterPages.trim());
          break;
        case 'split-chapters': q.set('bookmarkLevel', splitBookmarkLevel); break;
        case 'split-size':
          if (!splitSize.trim()) return fail('A target size (e.g. 10MB) is required.');
          q.set('size', splitSize.trim());
          break;
        case 'extract-images': q.set('format', imageFormat); break;
        case 'to-images': q.set('format', imageFormat); break;
        case 'to-excel': case 'to-word': case 'to-powerpoint': case 'to-text': break;
        case 'ocr': q.set('lang', ocrLang || 'eng'); break;
        case 'compress': q.set('level', compressLevel); break;
      }

      const query = q.toString() ? `?${q.toString()}` : '';
      const blob = await apiFetchBlob(`/v1/sign/pdf-tools/${tool.key}${query}`, { method: 'POST', body: form });

      if (tool.outputMode === 'download') {
        triggerDownload(blob, tool.downloadName ?? 'output');
        showAlert(`${tool.label} finished — the file downloaded to your device.`, { variant: 'success' });
      } else {
        onExport(blob, buildToolSummary(tool), { tool: tool.key });
      }
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'This tool failed to run.');
    } finally {
      setRunning(false);
    }
  }

  const active = TOOLS.find(t => t.key === activeTool) ?? null;

  // Always full-screen, even when this panel itself is embedded in
  // SignEditor's narrow right column — drag-and-drop reordering genuinely
  // needs real space, the same reasoning the rest of this session's
  // embedded-panel work doesn't apply to. Applying forwards the result to
  // this component's own onExport (closing the whole PDF Tools panel, same
  // as every other tool); Cancel/X just returns to the tool grid.
  if (showOrganizer) {
    return (
      <PdfPageOrganizer
        documentSrc={documentSrc}
        fileName={fileName}
        onExport={(blob, summary, details) => { setShowOrganizer(false); onExport(blob, summary, details); }}
        onClose={() => setShowOrganizer(false)}
      />
    );
  }

  return (
    <div style={embedded
      ? { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0 }
      : { position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--white)', display: 'flex', flexDirection: 'column' }
    }>
      <div style={{ display: 'flex', alignItems: 'center', gap: embedded ? 8 : 12, padding: embedded ? '12px 16px' : '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Icon name="layers" size={16} style={{ color: 'var(--teal)' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>PDF Tools</span>
        {!embedded && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{fileName}</span>}
        <Button variant="outline" size="sm" onClick={onClose} style={{ marginLeft: 'auto' }}>
          {embedded ? <Icon name="close" size={13} /> : 'Close'}
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: embedded ? 16 : 32 }}>
        {baseUrl === undefined ? (
          <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, marginTop: 60 }}>Loading…</div>
        ) : baseUrl === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: embedded ? '100%' : 460, margin: embedded ? '20px auto 0' : '60px auto 0', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="layers" size={24} style={{ color: 'var(--ink3)' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>PDF Tools aren't configured yet</div>
            {isSuperAdmin ? (
              <>
                <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5 }}>
                  These tools run against a self-hosted Stirling-PDF instance (free, MIT-licensed, github.com/Stirling-Tools/Stirling-PDF).
                  Run it with <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>docker run -p 8080:8080 docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest</code>{' '}
                  and point the platform at its endpoint below.
                </div>
                <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 8 }}>
                  <input
                    type="url"
                    placeholder="http://localhost:8080"
                    value={urlDraft}
                    onChange={e => setUrlDraft(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}
                  />
                  <Button variant="default" onClick={saveBaseUrl} disabled={savingUrl}>
                    {savingUrl ? 'Saving…' : 'Save Endpoint'}
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5 }}>
                PDF processing tools require a Stirling-PDF endpoint to be configured by a SuperAdmin.
              </div>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: embedded ? '100%' : 960, margin: embedded ? 0 : '0 auto', display: 'flex', flexDirection: 'column', gap: embedded ? 18 : 24 }}>
            {!embedded && (
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
                Connected to Stirling-PDF at <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>{baseUrl}</code>. Pick a tool to run on <strong>{fileName}</strong>:
              </div>
            )}

            {CATEGORIES.map(cat => (
              <div key={cat}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: embedded ? '1fr' : 'repeat(auto-fill, minmax(210px, 1fr))', gap: embedded ? 8 : 12 }}>
                  {TOOLS.filter(t => t.category === cat).map(t => (
                    <div
                      key={t.key}
                      onClick={() => t.outputMode === 'organizer' ? setShowOrganizer(true) : setActiveTool(t.key)}
                      style={{
                        padding: embedded ? '8px 10px' : 14, borderRadius: 10, border: `1px solid ${activeTool === t.key ? 'var(--teal)' : 'var(--border)'}`,
                        background: activeTool === t.key ? 'var(--teal-l)' : 'var(--white)', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', gap: embedded ? 2 : 6, transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: embedded ? 22 : 28, height: embedded ? 22 : 28, borderRadius: 6, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', flexShrink: 0 }}>
                          <Icon name={t.icon} size={embedded ? 12 : 14} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: embedded ? 12.5 : 13, color: 'var(--ink)' }}>{t.label}</span>
                      </div>
                      {!embedded && <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.4 }}>{t.desc}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {active && (
              <div style={{ padding: embedded ? 14 : 20, borderRadius: 12, border: '1px solid var(--teal)', background: 'var(--white)', display: 'flex', flexDirection: 'column', gap: embedded ? 10 : 14, position: 'sticky', bottom: 0, boxShadow: 'var(--elev-lg)' }}>
                <div style={{ fontWeight: 700, fontSize: embedded ? 13 : 14, color: 'var(--teal)' }}>
                  Configure {active.label}
                  {active.outputMode === 'download' && <div style={{ fontWeight: 500, fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>Downloads a file, doesn’t change the envelope’s document</div>}
                </div>

                {active.key === 'rotate' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Rotation Angle:</span>
                    {['90', '180', '270'].map(a => (
                      <label key={a} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" name="angle" value={a} checked={angle === a} onChange={e => setAngle(e.target.value)} /> {a}°
                      </label>
                    ))}
                  </div>
                )}

                {active.key === 'crop' && (
                  <div style={{ display: 'grid', gridTemplateColumns: embedded ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10 }}>
                    {(['x', 'y', 'width', 'height'] as const).map(f => (
                      <div key={f}>
                        <label style={labelStyle}>{f[0].toUpperCase() + f.slice(1)} (pt)</label>
                        <input type="number" value={cropBox[f]} onChange={e => setCropBox(p => ({ ...p, [f]: e.target.value }))} style={inputStyle} />
                      </div>
                    ))}
                  </div>
                )}

                {active.key === 'delete-pages' && (
                  <div>
                    <label style={labelStyle}>Pages to delete (e.g. 2,4-6)</label>
                    <input type="text" placeholder="2,4-6" value={deletePages} onChange={e => setDeletePages(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {active.key === 'reorder' && (
                  <div>
                    <label style={labelStyle}>New page order (comma-separated, every page once — e.g. 3,1,2,4)</label>
                    <input type="text" placeholder="3,1,2,4" value={reorderPages} onChange={e => setReorderPages(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {active.key === 'n-up' && (
                  <div style={{ maxWidth: 200 }}>
                    <label style={labelStyle}>Pages per sheet</label>
                    <select value={pagesPerSheet} onChange={e => setPagesPerSheet(e.target.value)} style={inputStyle}>
                      {['2', '4', '9', '16'].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}

                {active.key === 'resize' && (
                  <div style={{ maxWidth: 200 }}>
                    <label style={labelStyle}>Target page size</label>
                    <select value={resizeSize} onChange={e => setResizeSize(e.target.value)} style={inputStyle}>
                      {['A4', 'A3', 'A5', 'LETTER', 'LEGAL'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {active.key === 'bookmarks' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bookmarks.map((b, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8 }}>
                        <input type="text" placeholder="Bookmark title" value={b.title}
                          onChange={e => setBookmarks(prev => prev.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                          style={{ ...inputStyle, flex: 1 }} />
                        <input type="number" placeholder="Page #" value={b.pageNumber} min={1}
                          onChange={e => setBookmarks(prev => prev.map((x, idx) => idx === i ? { ...x, pageNumber: e.target.value } : x))}
                          style={{ ...inputStyle, width: 90 }} />
                        <Button variant="outline" size="icon" onClick={() => setBookmarks(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)} disabled={bookmarks.length <= 1}>
                          <Icon name="x" size={13} />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setBookmarks(prev => [...prev, { title: '', pageNumber: '1' }])} style={{ alignSelf: 'flex-start' }}>
                      <Icon name="plus" size={12} /> Add Bookmark
                    </Button>
                  </div>
                )}

                {active.key === 'page-numbers' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Starting number</label>
                      <input type="number" value={pageNumStart} min={1} onChange={e => setPageNumStart(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Format ({'{n}'} = number, {'{total}'} = page count)</label>
                      <input type="text" value={pageNumText} onChange={e => setPageNumText(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                )}

                {active.key === 'watermark' && (
                  <div>
                    <label style={labelStyle}>Watermark Text</label>
                    <input type="text" placeholder="CONFIDENTIAL / DRAFT" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {active.key === 'redact' && (
                  <div>
                    <label style={labelStyle}>Comma-separated search terms to redact</label>
                    <input type="text" placeholder="TIN, NIDA, Secret" value={redactTerms} onChange={e => setRedactTerms(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {active.key === 'metadata' && (
                  <div style={{ display: 'grid', gridTemplateColumns: embedded ? '1fr' : '1fr 1fr 1fr', gap: 10 }}>
                    <div><label style={labelStyle}>Title</label><input type="text" value={metaTitle} onChange={e => setMetaTitle(e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Author</label><input type="text" value={metaAuthor} onChange={e => setMetaAuthor(e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Subject</label><input type="text" value={metaSubject} onChange={e => setMetaSubject(e.target.value)} style={inputStyle} /></div>
                  </div>
                )}

                {active.key === 'flatten' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={flattenFormsOnly} onChange={e => setFlattenFormsOnly(e.target.checked)} />
                    Only lock form fields (leave annotations/other interactivity alone)
                  </label>
                )}

                {active.key === 'repair' && (
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>No options — runs Stirling-PDF's structural repair pass and returns the result.</div>
                )}

                {active.key === 'protect' && (
                  <div>
                    <label style={labelStyle}>Password to open the document</label>
                    <input type="password" value={protectPassword} onChange={e => setProtectPassword(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {active.key === 'unlock' && (
                  <div>
                    <label style={labelStyle}>The document’s current password</label>
                    <input type="password" value={unlockPassword} onChange={e => setUnlockPassword(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {active.key === 'split-pages' && (
                  <div>
                    <label style={labelStyle}>Split after these pages (e.g. 3,7)</label>
                    <input type="text" placeholder="3,7" value={splitAfterPages} onChange={e => setSplitAfterPages(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {active.key === 'split-chapters' && (
                  <div style={{ maxWidth: 200 }}>
                    <label style={labelStyle}>Bookmark depth to split on</label>
                    <input type="number" min={1} value={splitBookmarkLevel} onChange={e => setSplitBookmarkLevel(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {active.key === 'split-size' && (
                  <div style={{ maxWidth: 200 }}>
                    <label style={labelStyle}>Target size per part</label>
                    <input type="text" placeholder="10MB" value={splitSize} onChange={e => setSplitSize(e.target.value)} style={inputStyle} />
                  </div>
                )}

                {(active.key === 'extract-images' || active.key === 'to-images') && (
                  <div style={{ maxWidth: 200 }}>
                    <label style={labelStyle}>Image format</label>
                    <select value={imageFormat} onChange={e => setImageFormat(e.target.value)} style={inputStyle}>
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                    </select>
                  </div>
                )}

                {(active.key === 'to-excel' || active.key === 'to-word' || active.key === 'to-powerpoint' || active.key === 'to-text') && (
                  <div style={{ fontSize: 13, color: 'var(--ink2)' }}>No options — converts the whole document and downloads the result.</div>
                )}

                {active.key === 'ocr' && (
                  <div style={{ maxWidth: 220 }}>
                    <label style={labelStyle}>OCR Language</label>
                    <select value={ocrLang} onChange={e => setOcrLang(e.target.value)} style={inputStyle}>
                      <option value="eng">English (eng)</option>
                      <option value="swa">Swahili (swa)</option>
                    </select>
                  </div>
                )}

                {active.key === 'compress' && (
                  <div style={{ maxWidth: 260 }}>
                    <label style={labelStyle}>Compression Level (1-10)</label>
                    <input type="range" min="1" max="10" value={compressLevel} onChange={e => setCompressLevel(e.target.value)} style={{ width: '100%' }} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <Button variant="outline" onClick={() => setActiveTool(null)}>Cancel</Button>
                  <Button variant="default" onClick={() => runTool(active)} disabled={running}>
                    {running ? 'Processing PDF…' : active.outputMode === 'download' ? 'Run Tool & Download' : 'Run Tool & Export'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
