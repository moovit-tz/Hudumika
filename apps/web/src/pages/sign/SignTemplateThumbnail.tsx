import React, { useMemo } from 'react';
import type { SignDocumentDefinition } from '@hudumika/types';

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]!));

interface SignTemplateThumbnailProps {
  name: string;
  definition: SignDocumentDefinition;
  className?: string;
  width?: number;
  height?: number;
}

/** High-fidelity local legal document parchment preview. */
export function SignTemplateThumbnail({
  name,
  definition,
  className = 'sign-template-thumbnail',
  width = 300,
  height = 380,
}: SignTemplateThumbnailProps) {
  const src = useMemo(() => {
    const lines: string[] = [];
    const rawBody = definition.body || '';
    for (const paragraph of rawBody
      .replace(/\{\{([^}]+)\}\}/g, (_, key: string) => `[${key.replace(/_/g, ' ').toUpperCase()}]`)
      .split('\n')) {
      if (!paragraph.trim()) {
        lines.push('');
        continue;
      }
      const words = paragraph.split(/\s+/);
      let line = '';
      for (const word of words) {
        if ((line + ' ' + word).length > 58 && line) {
          lines.push(line);
          line = '';
        }
        line += (line ? ' ' : '') + word;
      }
      if (line) lines.push(line);
      if (lines.length > 36) break;
    }

    const titleLines = name.match(/.{1,28}(?:\s|$)|.{1,28}/g)?.slice(0, 2) || [name];
    const headerHeight = 36 + titleLines.length * 18;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380" viewBox="0 0 300 380">
      <defs>
        <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0f766e" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#0369a1" stop-opacity="0.9"/>
        </linearGradient>
      </defs>
      <!-- Parchment sheet -->
      <rect x="0.5" y="0.5" width="299" height="379" rx="6" fill="#ffffff" stroke="#e2e8f0"/>
      <!-- Header accent bar -->
      <rect x="20" y="20" width="36" height="4" rx="2" fill="url(#headerGrad)"/>
      <text x="260" y="24" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="7.5" font-weight="700" fill="#94a3b8" letter-spacing="0.08em" text-anchor="end">OFFICIAL FORM</text>
      <!-- Title -->
      ${titleLines
        .map(
          (line, index) =>
            `<text x="20" y="${46 + index * 17}" font-family="Georgia,Cambria,serif" font-size="12" font-weight="700" fill="#0f172a">${escapeXml(
              line.trim()
            )}</text>`
        )
        .join('')}
      <!-- Formal divider line -->
      <line x1="20" y1="${headerHeight}" x2="280" y2="${headerHeight}" stroke="#cbd5e1" stroke-width="1.2"/>
      <line x1="20" y1="${headerHeight + 2.5}" x2="280" y2="${headerHeight + 2.5}" stroke="#e2e8f0" stroke-width="0.8"/>
      <!-- Clause lines -->
      ${lines
        .slice(0, Math.floor((340 - headerHeight) / 8.5))
        .map((line, index) => {
          if (!line.trim()) return '';
          const isHeading = line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.') || line.startsWith('4.');
          const isVar = line.includes('[') && line.includes(']');
          const fill = isHeading ? '#0f172a' : isVar ? '#0f766e' : '#475569';
          const weight = isHeading ? '700' : '400';
          return `<text x="20" y="${headerHeight + 14 + index * 8.5}" font-family="Georgia,serif" font-size="5.2" font-weight="${weight}" fill="${fill}">${escapeXml(
            line
          )}</text>`;
        })
        .join('')}
      <!-- Bottom seal / signature area -->
      <line x1="20" y1="352" x2="280" y2="352" stroke="#e2e8f0"/>
      <circle cx="258" cy="365" r="9" fill="#f8fafc" stroke="#0f766e" stroke-width="1"/>
      <text x="258" y="367.5" font-family="sans-serif" font-size="5" font-weight="bold" fill="#0f766e" text-anchor="middle">SEAL</text>
      <text x="20" y="367" font-family="-apple-system,sans-serif" font-size="6" fill="#94a3b8">HUDUMIKA VERIFIED LEGAL TEMPLATE · PAGE 1</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [name, definition.body]);

  return (
    <img
      className={className}
      src={src}
      alt={`Document preview of ${name}`}
      loading="lazy"
      decoding="async"
      width={width}
      height={height}
    />
  );
}
