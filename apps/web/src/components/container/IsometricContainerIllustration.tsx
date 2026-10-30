import React from 'react';
import { getContainerColor, ContainerColorPalette } from './containerColors.js';
import { CARRIER_ASSETS } from './carrierAssets.js';
import { detectShippingLine } from './shippingLines.js';

interface IsometricContainerProps {
  containerNumber?: string;
  isoCode?: string;
  carrierName?: string;
  colorHex?: string;
  height?: number; // meters e.g. 2.5
  width?: number;  // meters e.g. 2.5
  length?: number; // meters e.g. 12.5
  className?: string;
  showDimensions?: boolean;
  maxGrossWeightKg?: number;
  tareWeightKg?: number;
}

/**
 * 3D Isometric SVG Container Illustration
 * Features dynamic real-time carrier color painting, locally stored carrier artwork,
 * corrugated steel texture, locking gear, CSC certification seals, and ISO dimension annotations.
 */
export const IsometricContainerIllustration: React.FC<IsometricContainerProps> = ({
  containerNumber = '',
  isoCode = '20G1',
  carrierName,
  colorHex,
  height = 2.5,
  width = 2.5,
  length = 12.5,
  className = '',
  showDimensions = true,
  maxGrossWeightKg, tareWeightKg,
}) => {
  const hasContainerNum = !!(containerNumber && containerNumber.trim());
  const hasCarrier = !!(carrierName && carrierName.trim());
  const palette: ContainerColorPalette = getContainerColor(containerNumber, carrierName, colorHex);
  const detectedShippingLine = detectShippingLine(containerNumber) ?? detectShippingLine(carrierName);
  const shippingLineId = detectedShippingLine?.id || (hasCarrier || hasContainerNum ? palette.id : 'unbranded');
  const showLogo = !!(detectedShippingLine || (hasCarrier && shippingLineId !== 'unbranded')) && shippingLineId !== 'unbranded';

  const gradId = `cnt-grad-${(containerNumber || 'iso').replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} style={{ minHeight: 180 }}>
      <svg
        viewBox="0 0 540 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-w-[480px] drop-shadow-md overflow-visible"
      >
        <defs>
          {/* Dynamic Gradients for 3D realism from Container Color Engine */}
          <linearGradient id={`${gradId}-top`} x1="120" y1="45" x2="380" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={palette.light} />
            <stop offset="50%" stopColor={palette.roofGradStart} />
            <stop offset="100%" stopColor={palette.roofGradEnd} />
          </linearGradient>

          <linearGradient id={`${gradId}-front`} x1="60" y1="80" x2="135" y2="175" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={palette.primary} />
            <stop offset="100%" stopColor={palette.dark} />
          </linearGradient>

          <linearGradient id={`${gradId}-side`} x1="135" y1="80" x2="430" y2="155" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={palette.primary} />
            <stop offset="50%" stopColor={palette.roofGradEnd} />
            <stop offset="100%" stopColor={palette.dark} />
          </linearGradient>

          <linearGradient id="steelRod" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="50%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>

          <filter id="shadow3d" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="4" dy="12" stdDeviation="8" floodColor="#091c38" floodOpacity="0.32" />
          </filter>
        </defs>

        {/* ── Ground shadow ── */}
        <polygon
          points="80,186 142,204 436,152 384,136"
          fill="#0c1d38"
          opacity="0.22"
          filter="blur(5px)"
        />

        {/* ── 3D CONTAINER BODY ── */}
        <g filter="url(#shadow3d)">
          {/* Top Roof Face */}
          <polygon
            points="70,72 135,90 425,38 360,20"
            fill={`url(#${gradId}-top)`}
            stroke={palette.dark}
            strokeWidth="1.2"
          />

          {/* Roof corrugation ribs */}
          {[0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.92].map((pct, idx) => {
            const x1 = 70 + (425 - 70) * pct;
            const y1 = 72 + (38 - 72) * pct;
            const x2 = 135 + (360 - 135) * pct;
            const y2 = 90 + (20 - 90) * pct;
            return (
              <line
                key={`roof-${idx}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={palette.light}
                strokeWidth="0.8"
                opacity="0.45"
              />
            );
          })}

          {/* Front End / Doors (Left Face) */}
          <polygon
            points="70,72 135,90 135,188 70,170"
            fill={`url(#${gradId}-front)`}
            stroke={palette.dark}
            strokeWidth="1.2"
          />

          {/* Front Door Split & Gaskets */}
          <line x1="102" y1="81" x2="102" y2="179" stroke="#0a2245" strokeWidth="2" />

          {/* Door hinges & Locking Rods */}
          {/* Left Door Rods */}
          <rect x="80" y="77" width="2.5" height="97" rx="1.2" fill="url(#steelRod)" stroke="#334155" strokeWidth="0.5" />
          <rect x="94" y="80" width="2.5" height="97" rx="1.2" fill="url(#steelRod)" stroke="#334155" strokeWidth="0.5" />
          {/* Right Door Rods */}
          <rect x="110" y="84" width="2.5" height="99" rx="1.2" fill="url(#steelRod)" stroke="#334155" strokeWidth="0.5" />
          <rect x="124" y="88" width="2.5" height="97" rx="1.2" fill="url(#steelRod)" stroke="#334155" strokeWidth="0.5" />

          {/* Cam locks & Handles */}
          <rect x="78" y="125" width="6" height="3" rx="1" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />
          <rect x="92" y="129" width="6" height="3" rx="1" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />
          <rect x="108" y="133" width="6" height="3" rx="1" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />
          <rect x="122" y="137" width="6" height="3" rx="1" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />

          {/* Customs Seal (Yellow Bolt Seal on Center Catch) */}
          <circle cx="102" cy="132" r="2.8" fill="#eab308" stroke="#a16207" strokeWidth="0.6" />
          <rect x="100.8" y="134" width="2.4" height="6" rx="0.6" fill="#facc15" stroke="#a16207" strokeWidth="0.4" />

          {/* Long Side Wall (Right Face) */}
          <polygon
            points="135,90 425,38 425,136 135,188"
            fill={`url(#${gradId}-side)`}
            stroke={palette.dark}
            strokeWidth="1.2"
          />

          {/* Vertical Corrugation Ribs on Long Side */}
          {Array.from({ length: 24 }).map((_, i) => {
            const t = (i + 1) / 25;
            const topX = 135 + (425 - 135) * t;
            const topY = 90 + (38 - 90) * t;
            const btmX = 135 + (425 - 135) * t;
            const btmY = 188 + (136 - 188) * t;
            return (
              <g key={`corrugation-${i}`}>
                {/* Highlight line */}
                <line x1={topX - 1} y1={topY} x2={btmX - 1} y2={btmY} stroke="#ffffff" strokeWidth="1.1" opacity="0.25" />
                {/* Shadow line */}
                <line x1={topX + 1.2} y1={topY} x2={btmX + 1.2} y2={btmY} stroke="#071b38" strokeWidth="1.6" opacity="0.65" />
              </g>
            );
          })}

          {/* Corner Castings (Reinforced Top/Bottom Castings) */}
          {/* Top Front-Left */}
          <polygon points="68,70 76,73 76,80 68,77" fill="#0d2e5b" stroke="#60a5fa" strokeWidth="0.6" />
          {/* Top Front-Right */}
          <polygon points="133,88 141,86 141,96 133,98" fill="#0d2e5b" stroke="#60a5fa" strokeWidth="0.6" />
          {/* Top Rear-Right */}
          <polygon points="423,36 429,38 429,46 423,44" fill="#0d2e5b" stroke="#60a5fa" strokeWidth="0.6" />
          {/* Bottom Front-Left */}
          <polygon points="68,168 76,171 76,178 68,175" fill="#061b36" stroke="#475569" strokeWidth="0.6" />
          {/* Bottom Front-Right */}
          <polygon points="133,186 141,184 141,194 133,196" fill="#061b36" stroke="#475569" strokeWidth="0.6" />
          {/* Bottom Rear-Right */}
          <polygon points="423,134 429,136 429,144 423,142" fill="#061b36" stroke="#475569" strokeWidth="0.6" />

          {/* ── SHIPPING LINE CARRIER LOGO — only when a container number or carrier is known ── */}
          {showLogo && detectedShippingLine && CARRIER_ASSETS[detectedShippingLine.id] &&
            <g transform="matrix(0.96 -0.17 0.03 0.98 175 106)">
              <rect x="0" y="-12" width="180" height="60" rx="4" fill="white" opacity="0.95" />
              <image href={`/carriers/${CARRIER_ASSETS[detectedShippingLine.id]}`} x="8" y="-6" width="164" height="48" preserveAspectRatio="xMidYMid meet" />
            </g>}

          {/* Container Markings & Decals */}
          {/* Front Door Text */}
          <g transform="matrix(0.96 0.28 -0.05 0.98 75 92)" opacity="0.9">
            <text x="0" y="0" fill="#ffffff" fontSize="4.5" fontWeight="900" fontFamily="sans-serif" letterSpacing="0.4">
              {hasContainerNum ? `${containerNumber.slice(0, 4)} ${containerNumber.slice(4)}` : 'ISO 6346'}
            </text>
            <text x="0" y="7" fill="#cbd5e1" fontSize="3.8" fontWeight="700" fontFamily="sans-serif">
              {isoCode || '20G1'}
            </text>
            <text x="0" y="14" fill="#94a3b8" fontSize="2.8" fontFamily="sans-serif">
              MAX.WT {maxGrossWeightKg ? maxGrossWeightKg.toLocaleString() : '—'} KG
            </text>
            <text x="0" y="19" fill="#94a3b8" fontSize="2.8" fontFamily="sans-serif">
              TARE WT {tareWeightKg ? tareWeightKg.toLocaleString() : '—'} KG
            </text>
          </g>

          {/* Side Panel Container Identification Decal (Rear Upper Right) */}
          <g transform="matrix(0.96 -0.17 0.03 0.98 375 64)" opacity="0.9">
            <text x="0" y="0" fill="#ffffff" fontSize="6.5" fontWeight="900" fontFamily="monospace" letterSpacing="0.8">
              {hasContainerNum ? containerNumber : (isoCode || 'CONTAINER')}
            </text>
            <text x="0" y="8" fill="#93c5fd" fontSize="4.5" fontWeight="700" fontFamily="sans-serif">
              {isoCode || '20G1'} · {length}M
            </text>
          </g>
        </g>

        {/* ── DIMENSION CALLOUTS (Matching Image 1 & 2) ── */}
        {showDimensions && (
          <g className="dimension-lines">
            {/* Height (Left Vertical Line) */}
            <g stroke="#3b82f6" strokeWidth="0.8" opacity="0.8">
              <line x1="58" y1="72" x2="58" y2="170" />
              <line x1="54" y1="72" x2="62" y2="72" />
              <line x1="54" y1="170" x2="62" y2="170" />
              <polygon points="58,72 56,76 60,76" fill="#3b82f6" />
              <polygon points="58,170 56,166 60,166" fill="#3b82f6" />
            </g>
            <text
              x="53"
              y="125"
              fill="#2563eb"
              fontSize="8"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="end"
              transform="rotate(-90 53 125)"
            >
              H: {height}m
            </text>

            {/* Width (Front Bottom Width Line) */}
            <g stroke="#3b82f6" strokeWidth="0.8" opacity="0.8">
              <line x1="68" y1="177" x2="133" y2="195" />
              <line x1="66" y1="172" x2="70" y2="182" />
              <line x1="131" y1="190" x2="135" y2="200" />
            </g>
            <text
              x="100"
              y="198"
              fill="#2563eb"
              fontSize="8"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              W: {width}m
            </text>

            {/* Length (Long Side Bottom Dimension Line) */}
            <g stroke="#3b82f6" strokeWidth="0.8" opacity="0.8">
              <line x1="140" y1="197" x2="430" y2="145" />
              <line x1="137" y1="192" x2="143" y2="202" />
              <line x1="427" y1="140" x2="433" y2="150" />
            </g>
            <text
              x="285"
              y="180"
              fill="#2563eb"
              fontSize="8"
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
              transform="rotate(-10 285 180)"
            >
              L: {length}M
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
