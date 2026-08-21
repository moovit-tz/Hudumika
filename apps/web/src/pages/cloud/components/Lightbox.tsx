import React, { useState } from 'react';
import { Icon } from '../../../components/Icon.js';
import { Dialog, DialogContent } from '../../../components/ui/dialog.js';
import type { CloudFile } from '../../../shells/cloud-context.js';
import { previewKind } from '../lib/fileTypeStyle.js';
import { usePreviewBlob } from '../lib/usePreviewBlob.js';
import { DocThumbnail } from './DocThumbnail.js';

/**
 * Full-screen Google Drive style document viewer modal:
 * - Top action bar with File/View/Insert/Tools/Help menu, zoom, page counter, print, share, audio overview
 * - Left page thumbnail navigator strip
 * - Center rendered document sheet with zoom controls
 * - Right ✨ AI Summary drawer with bullet points & Q&A suggestions
 */
export function Lightbox({ item, onClose, onDownload }: { item: CloudFile; onClose: () => void; onDownload: (item: CloudFile) => void }) {
  const kind = previewKind(item.type);
  const { url, loading, error } = usePreviewBlob(item.id);

  const [zoom, setZoom] = useState(100);
  const [showAiDrawer, setShowAiDrawer] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'qa'>('summary');
  const [userQuestion, setUserQuestion] = useState('');

  const isPdf = item.type === 'pdf' || item.name.endsWith('.pdf');
  const isSheet = ['xlsx', 'xls', 'csv'].includes(item.type) || item.name.endsWith('.xlsx');
  const badgeColor = isPdf ? '#ef4444' : isSheet ? '#10b981' : '#2563eb';
  const badgeLabel = isPdf ? 'PDF' : isSheet ? 'SHEET' : 'DOC';

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent hideClose className="max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh] p-0 flex flex-col overflow-hidden bg-[#111827] border-none rounded-none">
        
        {/* Top Google Drive File Viewer Navbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#1f2937', borderBottom: '1px solid #374151', color: '#fff', flexShrink: 0, gap: 12 }}>
          
          {/* Left Title & Menus */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ background: badgeColor, color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 6px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0 }}>
              {badgeLabel}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f9fafb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>
                  {item.name}
                </span>
                <span style={{ background: '#f59e0b', color: '#78350f', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>
                  EXTERNAL
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: '#9ca3af', marginTop: 1 }}>
                <span className="hover:text-white cursor-pointer">File</span>
                <span className="hover:text-white cursor-pointer">View</span>
                <span className="hover:text-white cursor-pointer">Insert</span>
                <span className="hover:text-white cursor-pointer">Tools</span>
                <span className="hover:text-white cursor-pointer">Help</span>
              </div>
            </div>
          </div>

          {/* Middle Toolbar (Page count, Print, Download, Zoom, Comment, Audio) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#374151', padding: '4px 12px', borderRadius: 20 }}>
            <span style={{ fontSize: 12, color: '#d1d5db' }}>Page 1 / 1</span>
            <div style={{ width: 1, height: 16, background: '#4b5563' }} />
            <button onClick={() => window.print()} title="Print" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#d1d5db', display: 'flex' }}>
              <Icon name="printer" size={15} color="#d1d5db" />
            </button>
            <button onClick={() => onDownload(item)} title="Download" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#d1d5db', display: 'flex' }}>
              <Icon name="download" size={15} color="#d1d5db" />
            </button>
            <div style={{ width: 1, height: 16, background: '#4b5563' }} />
            <button onClick={() => setZoom(z => Math.max(50, z - 10))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: '#d1d5db', fontSize: 14 }}>-</button>
            <span style={{ fontSize: 12, color: '#f3f4f6', minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(200, z + 10))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: '#d1d5db', fontSize: 14 }}>+</button>
            <div style={{ width: 1, height: 16, background: '#4b5563' }} />
            <button className="hover:bg-[#4b5563]" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', color: '#f3f4f6', fontSize: 12, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="message" size={14} color="#f3f4f6" /> Comment
            </button>
            <button className="hover:bg-[#4b5563]" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', color: '#f3f4f6', fontSize: 12, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="edit" size={14} color="#f3f4f6" /> Request eSignature
            </button>
          </div>

          {/* Right Action Bar (Open with, Share, AI Toggle, Close) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button className="hover:bg-[#374151]" style={{ background: 'none', border: '1px solid #4b5563', color: '#f3f4f6', fontSize: 12, padding: '5px 12px', borderRadius: 16, cursor: 'pointer' }}>
              Open with ▼
            </button>
            <button style={{ background: '#1a73e8', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', padding: '6px 16px', borderRadius: 18, cursor: 'pointer' }}>
              Share
            </button>
            <button
              onClick={() => setShowAiDrawer(s => !s)}
              title="Toggle AI Summary"
              style={{ background: showAiDrawer ? 'rgba(26, 115, 232, 0.2)' : 'none', border: '1px solid #4b5563', color: '#60a5fa', padding: 6, borderRadius: '50%', cursor: 'pointer', display: 'flex' }}
            >
              <Icon name="sparkle" size={16} color="#60a5fa" />
            </button>
            <button onClick={onClose} title="Close viewer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#9ca3af', display: 'flex' }}>
              <Icon name="close" size={20} color="#9ca3af" />
            </button>
          </div>
        </div>

        {/* Main Document Viewer Container */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          
          {/* Left Page Thumbnail Bar */}
          <div style={{ width: 110, background: '#1f2937', borderRight: '1px solid #374151', padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, overflowY: 'auto' }}>
            <div style={{ width: 80, height: 104, border: '2px solid #1a73e8', borderRadius: 4, overflow: 'hidden', background: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
              <DocThumbnail type={item.type} name={item.name} url={url} />
            </div>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>1</span>
          </div>

          {/* Center Document Canvas Sheet Viewport */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030712', overflow: 'auto', padding: 32 }}>
            <div
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease',
                boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
                width: '740px',
                height: '920px',
                background: '#ffffff',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {loading && <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading preview…</div>}
              {!loading && kind === 'image' && url && <img src={url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
              {!loading && kind === 'pdf' && url && <iframe src={url} title={item.name} style={{ width: '100%', height: '100%', border: 'none' }} />}
              {(!url || (!loading && kind !== 'image' && kind !== 'pdf')) && <DocThumbnail type={item.type} name={item.name} url={url} />}
            </div>
          </div>

          {/* Right Google Gemini ✨ AI Summary Drawer */}
          {showAiDrawer && (
            <div style={{ width: 340, background: '#111827', borderLeft: '1px solid #374151', display: 'flex', flexDirection: 'column', color: '#f3f4f6', flexShrink: 0 }}>
              
              {/* Drawer Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1f2937' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#f3f4f6' }}>
                  <Icon name="sparkle" size={16} color="#60a5fa" />
                  <span>Summary</span>
                </div>
                <button onClick={() => setShowAiDrawer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                  <Icon name="close" size={16} color="#9ca3af" />
                </button>
              </div>

              {/* Drawer Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, lineHeight: 1.5 }}>
                <div>
                  <p style={{ color: '#d1d5db', margin: '0 0 10px' }}>
                    This document outlines audit procedures, regulatory requirements, and reporting details for official compliance filing.
                  </p>
                  <div style={{ fontWeight: 700, color: '#f9fafb', marginBottom: 6 }}>Audit Responsibilities and Procedures</div>
                  <ul style={{ paddingLeft: 18, margin: 0, color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Auditors assess internal controls to design appropriate procedures regarding financial statement disclosures.</li>
                    <li>Evaluates the appropriateness of accounting policies used and the reasonableness of estimates made by directors.</li>
                    <li>Verifies tax clearance status, business license validity, and official signatory authority.</li>
                  </ul>
                </div>

                {/* Quick AI Suggestion Chips */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => setUserQuestion('List the main points for this file')}
                    className="hover:bg-[#1f2937]"
                    style={{ background: '#030712', border: '1px solid #374151', color: '#93c5fd', padding: '8px 12px', borderRadius: 16, fontSize: 12, textAlign: 'left', cursor: 'pointer' }}
                  >
                    List the main points for this file
                  </button>
                  <button
                    onClick={() => setUserQuestion('Ask a question about this file')}
                    className="hover:bg-[#1f2937]"
                    style={{ background: '#030712', border: '1px solid #374151', color: '#93c5fd', padding: '8px 12px', borderRadius: 16, fontSize: 12, textAlign: 'left', cursor: 'pointer' }}
                  >
                    Ask a question about this file
                  </button>
                  <button
                    onClick={() => setUserQuestion('')}
                    style={{ background: '#1a73e8', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700, textAlign: 'center', cursor: 'pointer' }}
                  >
                    Ask Gemini ✨
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
