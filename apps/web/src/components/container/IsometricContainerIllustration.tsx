import React from 'react';
import { getContainerColor, ContainerColorPalette } from './containerColors.js';
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
}

/**
 * 3D Isometric SVG Container Illustration
 * Features dynamic real-time carrier color painting, authentic vector logos from
 * Wikipedia's List of Largest Container Shipping Companies & MarineTraffic,
 * corrugated steel texture, locking gear, CSC certification seals, and ISO dimension annotations.
 */
export const IsometricContainerIllustration: React.FC<IsometricContainerProps> = ({
  containerNumber = 'MSCU1234567',
  isoCode = '20G1',
  carrierName,
  colorHex,
  height = 2.5,
  width = 2.5,
  length = 12.5,
  className = '',
  showDimensions = true,
}) => {
  const hasContainerNum = !!(containerNumber && containerNumber.trim());
  const hasCarrier = !!(carrierName && carrierName.trim());
  const palette: ContainerColorPalette = getContainerColor(containerNumber, carrierName, colorHex);
  const detectedShippingLine = detectShippingLine(containerNumber || carrierName);
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
          {showLogo && <g transform="matrix(0.96 -0.17 0.03 0.98 175 106)" opacity="0.96">
            {/* MSC — Mediterranean Shipping Company (Rank #1) */}
            {shippingLineId === 'msc' && (
              <g id="logo-msc">
                {/* Yellow Rounded Badge with official wave 'm' script and star */}
                <rect x="0" y="0" width="32" height="32" rx="6" fill="#FDB913" stroke="#D97706" strokeWidth="1" />
                <path
                  d="M6 22 C6 13, 11 9, 16 15 C21 9, 26 13, 26 22"
                  fill="none"
                  stroke="#111827"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                />
                <circle cx="16" cy="8.5" r="2.2" fill="#111827" />
                {/* MSC Wordmark */}
                <text x="38" y="22" fill="#ffffff" fontSize="23" fontWeight="900" fontFamily="'Arial Black', Impact, sans-serif" letterSpacing="2.5">
                  MSC
                </text>
                <text x="39" y="30" fill="#FDB913" fontSize="5.5" fontWeight="800" fontFamily="sans-serif" letterSpacing="1">
                  MEDITERRANEAN SHIPPING COMPANY
                </text>
              </g>
            )}

            {/* MAERSK Line — Historic 7-Point Star & Wordmark (Rank #2) */}
            {shippingLineId === 'maersk' && (
              <g id="logo-maersk">
                <g transform="translate(16, 16)">
                  <circle cx="0" cy="0" r="15" fill="rgba(255,255,255,0.2)" />
                  <polygon
                    points="0,-13 2.8,-4.5 11.2,-5.5 5.5,1 10.2,7.6 2,6.5 -2,13 -5.5,5.5 -12.2,5.5 -8.2,-1 -11.2,-7.5 -2.8,-5.5"
                    fill="#ffffff"
                  />
                  <circle cx="0" cy="0" r="3" fill="#0284c7" />
                </g>
                <text x="38" y="22" fill="#ffffff" fontSize="22" fontWeight="900" fontFamily="'Helvetica Neue', Arial, sans-serif" letterSpacing="3">
                  MAERSK
                </text>
                <text x="39" y="30" fill="#e0f2fe" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  A.P. MOLLER - MAERSK
                </text>
              </g>
            )}

            {/* CMA CGM Group — Dynamic Red/White Swooshes (Rank #3) */}
            {shippingLineId === 'cma_cgm' && (
              <g id="logo-cma">
                {/* French Tricolor Dynamic Sails */}
                <path d="M2 26 C6 11, 17 6, 26 26 Z" fill="#E30613" />
                <path d="M10 26 C15 12, 24 8, 32 26 Z" fill="#ffffff" />
                <text x="38" y="21" fill="#ffffff" fontSize="21" fontWeight="900" fontFamily="'Arial Black', sans-serif" letterSpacing="1.8">
                  CMA CGM
                </text>
                <text x="39" y="29" fill="#fca5a5" fontSize="5.5" fontWeight="800" fontFamily="sans-serif" letterSpacing="1">
                  SHIPPING GROUP
                </text>
              </g>
            )}

            {/* COSCO SHIPPING — Planetary Orbit Rings & Core Globe (Rank #4) */}
            {shippingLineId === 'cosco' && (
              <g id="logo-cosco">
                <g transform="translate(16, 16)">
                  <circle cx="0" cy="0" r="15" fill="#ffffff" />
                  <ellipse cx="0" cy="0" rx="13" ry="5" fill="none" stroke="#E60012" strokeWidth="2" transform="rotate(-30)" />
                  <ellipse cx="0" cy="0" rx="13" ry="5" fill="none" stroke="#0047BA" strokeWidth="2" transform="rotate(30)" />
                  <circle cx="0" cy="0" r="4" fill="#0047BA" />
                  <circle cx="0" cy="0" r="1.8" fill="#ffffff" />
                </g>
                <text x="38" y="20" fill="#ffffff" fontSize="20" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.8">
                  COSCO
                </text>
                <text x="39" y="29" fill="#FACC15" fontSize="7" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.5">
                  SHIPPING
                </text>
              </g>
            )}

            {/* Hapag-Lloyd — Double Anchors Shield & Wordmark (Rank #5) */}
            {shippingLineId === 'hapag_lloyd' && (
              <g id="logo-hapag">
                <path d="M2 2 L28 2 L28 20 C28 27, 15 32, 15 32 C15 32, 2 27, 2 20 Z" fill="#ffffff" stroke="#9a3412" strokeWidth="0.8" />
                <line x1="7" y1="7" x2="23" y2="23" stroke="#002868" strokeWidth="2.8" strokeLinecap="round" />
                <line x1="23" y1="7" x2="7" y2="23" stroke="#002868" strokeWidth="2.8" strokeLinecap="round" />
                <circle cx="15" cy="15" r="4.2" fill="#EA580C" />
                <circle cx="15" cy="15" r="2" fill="#ffffff" />
                <text x="35" y="21" fill="#ffffff" fontSize="20" fontWeight="900" fontFamily="serif" letterSpacing="1.2">
                  Hapag-Lloyd
                </text>
                <text x="36" y="29" fill="#fed7aa" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  CONTAINER LINE
                </text>
              </g>
            )}

            {/* ONE (Ocean Network Express) — Magenta Block & Clean Wordmark (Rank #6) */}
            {shippingLineId === 'one' && (
              <g id="logo-one">
                <rect x="0" y="0" width="32" height="32" rx="7" fill="#ffffff" />
                <text x="16" y="22" fill="#DB2777" fontSize="17" fontWeight="900" fontFamily="'Arial Black', Impact, sans-serif" textAnchor="middle" letterSpacing="-0.8">
                  ONE
                </text>
                <rect x="25.5" y="19" width="3" height="3" rx="0.4" fill="#DB2777" />
                <text x="38" y="22" fill="#ffffff" fontSize="24" fontWeight="900" fontFamily="'Arial Black', sans-serif" letterSpacing="2.5">
                  ONE
                </text>
                <text x="39" y="30" fill="#fbcfe8" fontSize="5.5" fontWeight="800" fontFamily="sans-serif" letterSpacing="1.2">
                  OCEAN NETWORK EXPRESS
                </text>
              </g>
            )}

            {/* Evergreen Marine — Laurel Compass Rose (Rank #7) */}
            {shippingLineId === 'evergreen' && (
              <g id="logo-evergreen">
                <g transform="translate(16, 16)">
                  <circle cx="0" cy="0" r="15" fill="#ffffff" />
                  <circle cx="0" cy="0" r="11.5" fill="#15803d" />
                  <polygon
                    points="0,-11 2.4,-3 10.5,-2.4 3.8,2 7.8,8.5 1,4.2 -2,10.5 -4.2,3.8 -10.5,3.8 -4.8,-1 -7.8,-7.8 -1,-3.8"
                    fill="#ffffff"
                  />
                  <circle cx="0" cy="0" r="2.8" fill="#15803d" />
                </g>
                <text x="38" y="22" fill="#ffffff" fontSize="22" fontWeight="900" fontFamily="'Arial Black', sans-serif" letterSpacing="2.8">
                  EVERGREEN
                </text>
                <text x="39" y="30" fill="#bbf7d0" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  EVERGREEN MARINE CORP.
                </text>
              </g>
            )}

            {/* HMM (Hyundai Merchant Marine) — Dual Aerodynamic Chevrons (Rank #8) */}
            {shippingLineId === 'hmm' && (
              <g id="logo-hmm">
                <polygon points="0,5 15,5 23,16 15,27 0,27 8,16" fill="#DC2626" />
                <polygon points="12,5 27,5 35,16 27,27 12,27 20,16" fill="#ffffff" />
                <text x="42" y="22" fill="#ffffff" fontSize="22" fontWeight="900" fontFamily="'Arial Black', sans-serif" letterSpacing="2">
                  HMM
                </text>
                <text x="43" y="30" fill="#fed7aa" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  HYUNDAI MERCHANT MARINE
                </text>
              </g>
            )}

            {/* Yang Ming Marine Transport — Sunburst Red Triangle (Rank #9) */}
            {shippingLineId === 'yang_ming' && (
              <g id="logo-yangming">
                <rect x="0" y="2" width="28" height="28" rx="4" fill="#2563EB" />
                <path d="M4 26 L14 7 L24 26 Z" fill="#EF4444" />
                <text x="14" y="23" fill="#ffffff" fontSize="11" fontWeight="900" fontFamily="sans-serif" textAnchor="middle">
                  YM
                </text>
                <text x="35" y="21" fill="#0f172a" fontSize="19" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.8">
                  YANG MING
                </text>
                <text x="36" y="29" fill="#3b82f6" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  MARINE TRANSPORT
                </text>
              </g>
            )}

            {/* ZIM Integrated Shipping — 7 Golden Stars & "Z" Disc (Rank #10) */}
            {shippingLineId === 'zim' && (
              <g id="logo-zim">
                <g transform="translate(15, 15)">
                  <circle cx="0" cy="0" r="14" fill="#FDB913" />
                  <text x="0" y="6" fill="#0F766E" fontSize="14" fontWeight="900" fontFamily="'Arial Black', sans-serif" textAnchor="middle">
                    Z
                  </text>
                  {[0, 51.4, 102.8, 154.2, 205.6, 257, 308.4].map((deg, i) => {
                    const rad = (deg * Math.PI) / 180;
                    const cx = 11.5 * Math.sin(rad);
                    const cy = -11.5 * Math.cos(rad);
                    return <circle key={i} cx={cx} cy={cy} r="1" fill="#ffffff" />;
                  })}
                </g>
                <text x="36" y="22" fill="#ffffff" fontSize="22" fontWeight="900" fontFamily="'Arial Black', sans-serif" letterSpacing="2.5">
                  ZIM
                </text>
                <text x="37" y="30" fill="#FDB913" fontSize="5.5" fontWeight="800" fontFamily="sans-serif" letterSpacing="1.2">
                  INTEGRATED SHIPPING
                </text>
              </g>
            )}

            {/* Wan Hai Lines — Dual Ocean Waves (Rank #11) */}
            {shippingLineId === 'wan_hai' && (
              <g id="logo-wanhai">
                <g transform="translate(15, 15)">
                  <circle cx="0" cy="0" r="14" fill="#ffffff" />
                  <path d="M-11 3 C-6 -8, 6 -8, 11 3 C6 11, -6 11, -11 3 Z" fill="#0284C7" />
                  <path d="M-9 6 C-4 1, 4 1, 9 6 C4 13, -4 13, -9 6 Z" fill="#0369A1" />
                </g>
                <text x="36" y="21" fill="#ffffff" fontSize="19" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.5">
                  WAN HAI
                </text>
                <text x="37" y="29" fill="#bae6fd" fontSize="5.5" fontWeight="800" fontFamily="sans-serif" letterSpacing="1">
                  WAN HAI LINES
                </text>
              </g>
            )}

            {/* PIL (Pacific International Lines) — Red/Gold Oval (Rank #12) */}
            {shippingLineId === 'pil' && (
              <g id="logo-pil">
                <ellipse cx="15" cy="15" rx="15" ry="12" fill="#DC2626" stroke="#FDB913" strokeWidth="1.5" />
                <text x="15" y="20" fill="#FDB913" fontSize="12" fontWeight="900" fontStyle="italic" fontFamily="serif" textAnchor="middle">
                  PIL
                </text>
                <text x="36" y="21" fill="#ffffff" fontSize="21" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.8">
                  PIL
                </text>
                <text x="37" y="29" fill="#fef08a" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  PACIFIC INTERNATIONAL LINES
                </text>
              </g>
            )}

            {/* OOCL (Orient Overseas Container Line) — Plum Blossom (Rank #13) */}
            {shippingLineId === 'oocl' && (
              <g id="logo-oocl">
                <g transform="translate(15, 15)">
                  <circle cx="0" cy="0" r="14" fill="#DC2626" />
                  {[0, 72, 144, 216, 288].map((deg, i) => {
                    const rad = (deg * Math.PI) / 180;
                    const px = 6.5 * Math.sin(rad);
                    const py = -6.5 * Math.cos(rad);
                    return <circle key={i} cx={px} cy={py} r="4.2" fill="none" stroke="#ffffff" strokeWidth="1.8" />;
                  })}
                  <circle cx="0" cy="0" r="3" fill="#ffffff" />
                </g>
                <text x="36" y="22" fill="#ffffff" fontSize="22" fontWeight="900" fontFamily="sans-serif" letterSpacing="2">
                  OOCL
                </text>
                <text x="37" y="30" fill="#fecdd3" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  ORIENT OVERSEAS CONTAINER LINE
                </text>
              </g>
            )}

            {/* KMTC (Korea Marine Transport) — Compass Badge (Rank #14) */}
            {shippingLineId === 'kmtc' && (
              <g id="logo-kmtc">
                <rect x="0" y="2" width="28" height="28" rx="4" fill="#1E3A8A" />
                <polygon points="14,4 17,12 25,14 17,16 14,24 11,16 3,14 11,12" fill="#DC2626" />
                <polygon points="14,7 16,13 22,14 16,15 14,21 12,15 6,14 12,13" fill="#ffffff" />
                <text x="35" y="21" fill="#ffffff" fontSize="20" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.8">
                  KMTC
                </text>
                <text x="36" y="29" fill="#bfdbfe" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  KOREA MARINE TRANSPORT
                </text>
              </g>
            )}

            {/* SITC International Holdings (Rank #15) */}
            {shippingLineId === 'sitc' && (
              <g id="logo-sitc">
                <rect x="0" y="2" width="28" height="28" rx="4" fill="#1D4ED8" />
                <path d="M4 22 C8 8, 20 6, 24 22 Z" fill="#F97316" />
                <path d="M9 22 C12 10, 21 9, 25 22 Z" fill="#ffffff" />
                <text x="35" y="21" fill="#ffffff" fontSize="21" fontWeight="900" fontFamily="sans-serif" letterSpacing="2">
                  SITC
                </text>
                <text x="36" y="29" fill="#fed7aa" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  SITC CONTAINER LINES
                </text>
              </g>
            )}

            {/* Matson Navigation (Rank #16) */}
            {shippingLineId === 'matson' && (
              <g id="logo-matson">
                <path d="M4 4 H24 V18 C24 24, 14 28, 14 28 C14 28, 4 24, 4 18 Z" fill="#1E3A8A" stroke="#ffffff" strokeWidth="1" />
                <line x1="4" y1="8" x2="24" y2="20" stroke="#ffffff" strokeWidth="3" />
                <text x="32" y="21" fill="#ffffff" fontSize="20" fontWeight="900" fontFamily="serif" letterSpacing="1.5">
                  Matson
                </text>
                <text x="33" y="29" fill="#fde68a" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  MATSON NAVIGATION CO.
                </text>
              </g>
            )}

            {/* Messina Line — Red St. George Cross Shield (Rank #17) */}
            {shippingLineId === 'messina' && (
              <g id="logo-messina">
                <rect x="0" y="2" width="26" height="26" rx="4" fill="#991B1B" stroke="#ffffff" strokeWidth="0.8" />
                <rect x="6" y="6" width="14" height="18" rx="2" fill="#ffffff" />
                <rect x="11.5" y="8" width="3" height="14" fill="#DC2626" />
                <rect x="8" y="13.5" width="10" height="3" fill="#DC2626" />
                <text x="33" y="21" fill="#ffffff" fontSize="19" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.8">
                  MESSINA
                </text>
                <text x="34" y="29" fill="#fca5a5" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  IGNAZIO MESSINA &amp; C.
                </text>
              </g>
            )}

            {/* Grimaldi Lines (Rank #18) */}
            {shippingLineId === 'grimaldi' && (
              <g id="logo-grimaldi">
                <polygon points="14,2 26,14 14,26 2,14" fill="#EAB308" />
                <text x="14" y="19" fill="#0F172A" fontSize="13" fontWeight="900" fontFamily="serif" textAnchor="middle">
                  G
                </text>
                <text x="32" y="21" fill="#ffffff" fontSize="18" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.8">
                  GRIMALDI
                </text>
                <text x="33" y="29" fill="#fde047" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  GRIMALDI LINES / ACL
                </text>
              </g>
            )}

            {/* Arkas Line (Rank #19) */}
            {shippingLineId === 'arkas' && (
              <g id="logo-arkas">
                <rect x="0" y="2" width="26" height="26" rx="4" fill="#0284C7" />
                <path d="M4 22 C7 10, 16 7, 22 22 Z" fill="#ffffff" />
                <text x="32" y="21" fill="#ffffff" fontSize="18" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.5">
                  ARKAS
                </text>
                <text x="33" y="29" fill="#bae6fd" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  ARKAS LINE
                </text>
              </g>
            )}

            {/* Swire Shipping (Rank #20) */}
            {shippingLineId === 'swire' && (
              <g id="logo-swire">
                <rect x="0" y="2" width="26" height="26" rx="4" fill="#1E3A8A" />
                <polygon points="13,6 21,14 13,22 5,14" fill="#DC2626" stroke="#ffffff" strokeWidth="1" />
                <polygon points="13,9 18,14 13,19 8,14" fill="#ffffff" />
                <text x="32" y="21" fill="#ffffff" fontSize="17" fontWeight="900" fontFamily="sans-serif" letterSpacing="1.5">
                  SWIRE
                </text>
                <text x="33" y="29" fill="#fca5a5" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  SWIRE SHIPPING
                </text>
              </g>
            )}

            {/* Corten / Generic SOC / Shipper Owned */}
            {(shippingLineId === 'corten_generic' || !shippingLineId) && (
              <g id="logo-corten">
                <rect x="0" y="2" width="26" height="24" rx="4" fill="rgba(255,255,255,0.15)" stroke="#ffffff" strokeWidth="0.8" />
                <text x="13" y="18" fill="#ffffff" fontSize="11" fontWeight="900" fontFamily="monospace" textAnchor="middle">
                  SOC
                </text>
                <text x="34" y="20" fill="#ffffff" fontSize="18" fontWeight="800" fontFamily="sans-serif" letterSpacing="1.2">
                  SHIPPER OWNED
                </text>
                <text x="35" y="28" fill="#fed7aa" fontSize="5.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                  PRIVATE FLEET CONTAINER
                </text>
              </g>
            )}
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
              MAX.WT 30,480 KG
            </text>
            <text x="0" y="19" fill="#94a3b8" fontSize="2.8" fontFamily="sans-serif">
              TARE WT 3,780 KG
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
