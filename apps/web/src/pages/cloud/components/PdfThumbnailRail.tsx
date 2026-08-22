import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPageCanvas } from './PdfPageCanvas.js';

const THUMB_SCALE = 0.16;

function Thumb({ doc, pageNumber, active, onClick }: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onClick: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // A 500+ page document (a real one shows up in the wild, not a made-up
    // number — see the reference this rail was built to match) can't render
    // every thumbnail up front without freezing the tab. Only render a
    // thumbnail once its slot is actually near the visible scroll range.
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { root: el.closest('.pdf-thumb-rail'), rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (active) wrapRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div ref={wrapRef} className={`pdf-thumb${active ? ' pdf-thumb--active' : ''}`} onClick={onClick}>
      <div className="pdf-thumb-page">
        {visible && <PdfPageCanvas doc={doc} pageNumber={pageNumber} scale={THUMB_SCALE} />}
      </div>
      <span className="pdf-thumb-num">{pageNumber}</span>
    </div>
  );
}

export function PdfThumbnailRail({ doc, numPages, currentPage, onSelect }: {
  doc: PDFDocumentProxy;
  numPages: number;
  currentPage: number;
  onSelect: (page: number) => void;
}) {
  return (
    <div className="pdf-thumb-rail">
      {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
        <Thumb key={n} doc={doc} pageNumber={n} active={n === currentPage} onClick={() => onSelect(n)} />
      ))}
    </div>
  );
}
