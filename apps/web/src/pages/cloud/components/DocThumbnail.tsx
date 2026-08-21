import React from 'react';
import { fileTypeStyle, previewKind } from '../lib/fileTypeStyle.js';

interface DocThumbnailProps {
  type: string;
  name: string;
  url?: string | null;
}

/**
 * Renders realistic Google Drive style document thumbnails:
 * - Scanned letterhead & contract layout for PDF/Docs
 * - Grid cell table with colored headers for Sheets/Spreadsheets
 * - Chart / presentation layout for Slides/PPTX
 * - Image preview for photos
 */
export function DocThumbnail({ type, name, url }: DocThumbnailProps) {
  const kind = previewKind(type);

  if (kind === 'image' && url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  }

  const isPdf = type === 'pdf' || name.endsWith('.pdf');
  const isSheet = ['xlsx', 'xls', 'csv', 'spreadsheet'].includes(type) || name.endsWith('.xlsx') || name.endsWith('.csv');
  const isDoc = ['doc', 'docx', 'document', 'txt'].includes(type) || name.endsWith('.docx') || name.endsWith('.doc');
  const isPresentation = ['ppt', 'pptx', 'presentation'].includes(type) || name.endsWith('.pptx');

  if (isSheet) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#f8fafc', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, background: '#10b981', padding: '4px 6px', borderRadius: 4, color: '#fff', fontWeight: 700 }}>
          <span>QTY</span><span>ITEM</span><span>PRICE</span><span>TOTAL</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, background: '#fff', padding: '3px 6px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>
          <span>12</span><span>Widget A</span><span>$45.00</span><span>$540.00</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, background: '#fff', padding: '3px 6px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>
          <span>08</span><span>Widget B</span><span>$120.00</span><span>$960.00</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, background: '#ecfdf5', padding: '4px 6px', borderRadius: 3, fontWeight: 700, color: '#047857', marginTop: 'auto' }}>
          <span>SUB</span><span>TOTAL</span><span>USD</span><span>$1,500</span>
        </div>
      </div>
    );
  }

  if (isPresentation) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#fffbeb', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: '80%', height: 12, background: '#f59e0b', borderRadius: 3 }} />
        <div style={{ width: '60%', height: 6, background: '#fde68a', borderRadius: 2 }} />
        <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 6 }}>
          <div style={{ flex: 1, height: 28, background: '#fef3c7', borderRadius: 4 }} />
          <div style={{ flex: 1, height: 28, background: '#fef3c7', borderRadius: 4 }} />
        </div>
      </div>
    );
  }

  // Default Letterhead / Scanned PDF & Doc Preview Sheet
  return (
    <div style={{ width: '100%', height: '100%', background: '#f1f5f9', padding: '10px 14px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '82%', height: '100%', background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, borderRadius: '2px 2px 0 0' }}>
        {/* Letterhead & Logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: isPdf ? '#ef4444' : '#2563eb' }} />
            <div style={{ width: 36, height: 5, background: '#0f172a', borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 6, color: '#64748b', fontWeight: 600 }}>CONFIDENTIAL</div>
        </div>

        {/* Document Header Text Block */}
        <div style={{ width: '70%', height: 6, background: '#1e293b', borderRadius: 2, marginTop: 2 }} />
        <div style={{ width: '45%', height: 4, background: '#94a3b8', borderRadius: 1 }} />

        {/* Body Paragraph Lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
          <div style={{ width: '100%', height: 3, background: '#cbd5e1', borderRadius: 1 }} />
          <div style={{ width: '96%', height: 3, background: '#cbd5e1', borderRadius: 1 }} />
          <div style={{ width: '92%', height: 3, background: '#cbd5e1', borderRadius: 1 }} />
          <div style={{ width: '85%', height: 3, background: '#cbd5e1', borderRadius: 1 }} />
        </div>

        {/* Stamp / Signature Block */}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ width: 28, height: 2, background: '#64748b' }} />
            <div style={{ fontSize: 5, color: '#94a3b8' }}>Authorized Signatory</div>
          </div>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed #2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontSize: 5, fontWeight: 800, opacity: 0.85 }}>
            SEAL
          </div>
        </div>
      </div>
    </div>
  );
}
