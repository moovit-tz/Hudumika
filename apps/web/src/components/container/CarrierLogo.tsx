import React from 'react';
import { ShippingLine, detectShippingLine, SHIPPING_LINES } from './shippingLines.js';

export interface CarrierLogoProps {
  carrier?: string | ShippingLine | null;
  containerNumber?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  variant?: 'mark' | 'badge' | 'full' | 'horizontal';
  className?: string;
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * High-fidelity Vector Carrier Logo Registry
 * Rendered using authentic vector geometry, official color palettes, and typography
 * matching Wikipedia's List of Largest Container Shipping Companies & MarineTraffic directory.
 */
export const CarrierLogo: React.FC<CarrierLogoProps> = ({
  carrier,
  containerNumber,
  size = 'md',
  variant = 'mark',
  className = '',
}) => {
  // Resolve shipping line
  let line: ShippingLine | null = null;
  if (carrier && typeof carrier === 'object' && 'id' in carrier) {
    line = carrier;
  } else if (typeof carrier === 'string' && carrier.trim()) {
    line = detectShippingLine(carrier);
  } else if (containerNumber) {
    line = detectShippingLine(containerNumber);
  }

  // Fallback to MSC if none detected or default to generic SOC
  const carrierId = line?.id || (containerNumber ? 'corten_generic' : 'msc');
  const carrierName = line?.shortName || (typeof carrier === 'string' ? carrier : 'Carrier');

  // Compute pixel dimensions
  let pxSize = 28;
  if (typeof size === 'number') {
    pxSize = size;
  } else {
    switch (size) {
      case 'xs': pxSize = 16; break;
      case 'sm': pxSize = 22; break;
      case 'md': pxSize = 32; break;
      case 'lg': pxSize = 44; break;
      case 'xl': pxSize = 64; break;
    }
  }

  // Render the carrier's authentic vector symbol mark
  const renderMark = () => {
    switch (carrierId) {

      // ── MSC (Mediterranean Shipping Company) ─────────────────────────────
      // Yellow badge · abstract M-wave arch with 5-pointed star crown · "MSC"
      case 'msc':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#FDB913"/>
            {/* Stylised "m" arch — two rounded humps */}
            <path d="M5 29 C5 17,11 12,17 18 C18.5 19.5,19 20,20 20 C21 20,21.5 19.5,23 18 C29 12,35 17,35 29"
              fill="none" stroke="#111827" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round"/>
            {/* 5-pt star crown at top */}
            <polygon points="20,5 21.6,10 26.5,10 22.5,13.1 24.1,18 20,15 15.9,18 17.5,13.1 13.5,10 18.4,10"
              fill="#111827"/>
          </svg>
        );

      // ── Maersk Line ───────────────────────────────────────────────────────
      // Sky blue · white 7-pointed Maersk Star (heptagram, outer r=13 inner r=5)
      case 'maersk':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#009FD4"/>
            <polygon
              points="20,7 22.2,15.5 30.2,11.9 24.9,18.9 32.7,22.9 23.9,23.1 25.6,31.7 20,25 14.4,31.7 16.1,23.1 7.3,22.9 15.1,18.9 9.8,11.9 17.8,15.5"
              fill="#ffffff"/>
            {/* Centre disc to create open-star silhouette */}
            <circle cx="20" cy="20" r="3.5" fill="#009FD4"/>
          </svg>
        );

      // ── CMA CGM ───────────────────────────────────────────────────────────
      // French navy · bold red diagonal wave slash · white stacked "CMA/CGM"
      case 'cma_cgm':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#002F6C"/>
            {/* Red diagonal wave — fills left-to-upper-right sweep */}
            <path d="M3 40 Q10 22 24 8 L32 8 Q18 22 14 40 Z" fill="#E30613"/>
            {/* CMA text top-right */}
            <text x="30" y="17" fill="#ffffff" fontSize="7" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle" letterSpacing="0.3">CMA</text>
            {/* CGM text bottom-right */}
            <text x="30" y="33" fill="#ffffff" fontSize="7" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle" letterSpacing="0.3">CGM</text>
          </svg>
        );

      // ── COSCO Shipping Lines ──────────────────────────────────────────────
      // Deep blue · white globe disc · red + blue orbital crossing rings
      case 'cosco':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#0047BA"/>
            <circle cx="20" cy="20" r="14" fill="#ffffff"/>
            {/* Red orbital ring */}
            <ellipse cx="20" cy="20" rx="12.5" ry="5" fill="none" stroke="#E60012" strokeWidth="2.5"
              transform="rotate(-25 20 20)"/>
            {/* Blue orbital ring */}
            <ellipse cx="20" cy="20" rx="12.5" ry="5" fill="none" stroke="#0047BA" strokeWidth="2.5"
              transform="rotate(25 20 20)"/>
            {/* Pole axis */}
            <ellipse cx="20" cy="20" rx="1.5" ry="13" fill="none" stroke="#0047BA" strokeWidth="1.5"/>
            <circle cx="20" cy="20" r="3" fill="#0047BA"/>
            <circle cx="20" cy="20" r="1.5" fill="#ffffff"/>
          </svg>
        );

      // ── Hapag-Lloyd ───────────────────────────────────────────────────────
      // High-vis orange · white heraldic shield · blue "HL" monogram inside
      case 'hapag_lloyd':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#F47920"/>
            {/* White shield body */}
            <path d="M9 7 H31 V24 C31 31 20 36 20 36 C20 36 9 31 9 24 Z" fill="#ffffff"/>
            {/* Blue "HL" inside shield */}
            <text x="20" y="27" fill="#002868" fontSize="14" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle" letterSpacing="-0.5">HL</text>
            {/* Thin blue border on shield */}
            <path d="M9 7 H31 V24 C31 31 20 36 20 36 C20 36 9 31 9 24 Z"
              fill="none" stroke="#002868" strokeWidth="1.2"/>
          </svg>
        );

      // ── ONE (Ocean Network Express) ───────────────────────────────────────
      // Iconic hot magenta · white ultra-bold "ONE" · small geometric red mark
      case 'one':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#EF1F7F"/>
            <text x="19" y="26" fill="#ffffff" fontSize="19" fontWeight="900"
              fontFamily="'Arial Black',Arial,sans-serif" textAnchor="middle" letterSpacing="-1.5">ONE</text>
            {/* Small filled red square — part of their mark system */}
            <rect x="31" y="21.5" width="5" height="5" rx="1" fill="#C81062"/>
          </svg>
        );

      // ── Evergreen Marine Corporation ──────────────────────────────────────
      // Forest green · white circular emblem ring · inner compass / EG mark
      case 'evergreen':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#009E5A"/>
            {/* Outer white ring */}
            <circle cx="20" cy="20" r="14" fill="none" stroke="#ffffff" strokeWidth="2.5"/>
            {/* 8-pt compass rose inside */}
            <polygon
              points="20,9 21.5,17 28,14 22,19.5 29,20.5 22,21.5 28,27 21.5,22.5 20,31 18.5,22.5 12,27 18,21.5 11,20.5 18,19.5 12,14 18.5,17"
              fill="#ffffff"/>
            <circle cx="20" cy="20" r="2.5" fill="#009E5A"/>
          </svg>
        );

      // ── HMM (Hyundai Merchant Marine) ─────────────────────────────────────
      // Navy · two overlapping forward-pointing parallelograms (red + white) — 2018 "H" rebrand mark
      case 'hmm':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#002D62"/>
            {/* Red left parallelogram */}
            <polygon points="4,10 17,10 20,30 7,30" fill="#DC2626"/>
            {/* White right parallelogram */}
            <polygon points="16,10 29,10 32,30 19,30" fill="#ffffff"/>
            {/* Navy overlap strip so they look distinct */}
            <polygon points="16,10 17,10 20,30 19,30" fill="#002D62"/>
            {/* HMM label */}
            <text x="30" y="23" fill="#ffffff" fontSize="6" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle" letterSpacing="0.5">HMM</text>
          </svg>
        );

      // ── Yang Ming Marine Transport ────────────────────────────────────────
      // Royal blue · red upward-pointing triangle crest · white "YM"
      case 'yang_ming':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#005BAC"/>
            {/* Red triangle mark */}
            <polygon points="20,6 34,32 6,32" fill="#E30613"/>
            {/* White horizontal rule at base */}
            <rect x="6" y="29.5" width="28" height="2.5" fill="#ffffff"/>
            {/* White YM monogram inside triangle */}
            <text x="20" y="25" fill="#ffffff" fontSize="10" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle" letterSpacing="-0.5">YM</text>
          </svg>
        );

      // ── ZIM Integrated Shipping ───────────────────────────────────────────
      // Deep blue · large golden circle badge · bold teal "Z" inside
      case 'zim':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#003D8F"/>
            {/* Golden circle */}
            <circle cx="20" cy="20" r="13.5" fill="#FFD100"/>
            {/* Bold navy "Z" */}
            <text x="20" y="29" fill="#003D8F" fontSize="24" fontWeight="900"
              fontFamily="'Arial Black',Arial,sans-serif" textAnchor="middle">Z</text>
          </svg>
        );

      // ── Wan Hai Lines ─────────────────────────────────────────────────────
      // Cobalt blue · white circular emblem · stylised double-wave "WH" inside
      case 'wan_hai':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#00549F"/>
            <circle cx="20" cy="20" r="13" fill="#ffffff"/>
            {/* Double wave — S-curve lower + upper (Wan Hai visual language) */}
            <path d="M8 22 Q12 14 16 18 Q20 22 24 18 Q28 14 32 18"
              fill="none" stroke="#00549F" strokeWidth="3" strokeLinecap="round"/>
            <path d="M8 27 Q12 19 16 23 Q20 27 24 23 Q28 19 32 23"
              fill="none" stroke="#00549F" strokeWidth="2.5" strokeLinecap="round"/>
            {/* "WH" abbreviated monogram below waves */}
            <text x="20" y="37" fill="#ffffff" fontSize="7.5" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle" letterSpacing="1">WHL</text>
          </svg>
        );

      // ── PIL (Pacific International Lines) ────────────────────────────────
      // Crimson · golden oval frame · italic serif "PIL" in gold
      case 'pil':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#C8102E"/>
            {/* White outer disc */}
            <circle cx="20" cy="19" r="13.5" fill="#ffffff"/>
            {/* Red inner disc */}
            <circle cx="20" cy="19" r="11.5" fill="#C8102E"/>
            {/* Gold oval frame */}
            <ellipse cx="20" cy="19" rx="10" ry="8" fill="none" stroke="#FFB81C" strokeWidth="2"/>
            {/* Gold italic PIL */}
            <text x="20" y="23" fill="#FFB81C" fontSize="12" fontWeight="900" fontStyle="italic"
              fontFamily="Georgia,serif" textAnchor="middle" letterSpacing="0.5">PIL</text>
          </svg>
        );

      // ── OOCL (Orient Overseas Container Line) ────────────────────────────
      // Cardinal red · authentic white 5-petal plum blossom (梅花) symbol
      case 'oocl':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#C8102E"/>
            {/* 5-petal plum blossom — petals at 0°,72°,144°,216°,288° from top, r=7 */}
            {[0, 72, 144, 216, 288].map((deg, i) => {
              const r = (deg * Math.PI) / 180;
              return (
                <circle key={i}
                  cx={20 + 6.5 * Math.sin(r)}
                  cy={18 - 6.5 * Math.cos(r)}
                  r="5.5" fill="#ffffff"/>
              );
            })}
            {/* Red centre hiding petal overlaps */}
            <circle cx="20" cy="18" r="4.5" fill="#C8102E"/>
            {/* OOCL text below blossom */}
            <text x="20" y="37" fill="#ffffff" fontSize="7" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle" letterSpacing="1">OOCL</text>
          </svg>
        );

      // ── KMTC (Korea Marine Transport Corp.) ──────────────────────────────
      // Navy · red 8-point compass star · white inner star
      case 'kmtc':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#003087"/>
            {/* Red 8-point star (compass outer) */}
            <polygon
              points="20,5 22.8,16.5 32,13 25,21 36,22 25,24 32,32 22.8,28 20,39 17.2,28 8,32 15,24 4,22 15,21 8,13 17.2,16.5"
              fill="#C8102E"/>
            {/* White inner star */}
            <polygon
              points="20,10 22,18 30,20 22,22 20,30 18,22 10,20 18,18"
              fill="#ffffff"/>
            <circle cx="20" cy="20" r="3" fill="#003087"/>
          </svg>
        );

      // ── SITC International ────────────────────────────────────────────────
      // Royal blue · orange forward sail · white secondary sail · "SITC" label
      case 'sitc':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#003087"/>
            {/* Orange main sail */}
            <path d="M6 30 C9 14, 24 9, 31 30 Z" fill="#F7941D"/>
            {/* White inner sail overlay */}
            <path d="M13 30 C16 17, 27 13, 33 30 Z" fill="#ffffff"/>
            <text x="20" y="38" fill="#ffffff" fontSize="7" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle" letterSpacing="1">SITC</text>
          </svg>
        );

      // ── Matson Navigation ─────────────────────────────────────────────────
      // Midnight navy · heraldic shield with diagonal white sash · gold M serif
      case 'matson':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#1B3A6B"/>
            {/* Shield silhouette */}
            <path d="M9 7 H31 V24.5 C31 31 20 35 20 35 C20 35 9 31 9 24.5 Z" fill="#1B3A6B" stroke="#ffffff" strokeWidth="1.5"/>
            {/* Diagonal white sash (per the Matson house flag heritage) */}
            <clipPath id="matson-shield">
              <path d="M9 7 H31 V24.5 C31 31 20 35 20 35 C20 35 9 31 9 24.5 Z"/>
            </clipPath>
            <rect x="7" y="15" width="26" height="8" fill="#ffffff" transform="rotate(-22 20 19)" clipPath="url(#matson-shield)"/>
            {/* Gold M serif */}
            <text x="20" y="22" fill="#F7B500" fontSize="11" fontWeight="900"
              fontFamily="Georgia,serif" textAnchor="middle">M</text>
          </svg>
        );

      // ── Messina Line ──────────────────────────────────────────────────────
      // Burgundy · white shield · George's cross in red
      case 'messina':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#7B0020"/>
            {/* White shield */}
            <path d="M8 6 H32 V24 C32 31 20 37 20 37 C20 37 8 31 8 24 Z" fill="#ffffff"/>
            {/* Red vertical bar of cross */}
            <rect x="17.5" y="7" width="5" height="22" fill="#C8102E"
              clipPath="url(#msg-clip)"/>
            {/* Red horizontal bar */}
            <rect x="9" y="16" width="22" height="5" fill="#C8102E"
              clipPath="url(#msg-clip)"/>
            <clipPath id="msg-clip">
              <path d="M8 6 H32 V24 C32 31 20 37 20 37 C20 37 8 31 8 24 Z"/>
            </clipPath>
          </svg>
        );

      // ── Grimaldi Lines ────────────────────────────────────────────────────
      case 'grimaldi':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#001489"/>
            <polygon points="20,5 35,20 20,35 5,20" fill="#FFD700"/>
            <text x="20" y="26" fill="#001489" fontSize="17" fontWeight="900"
              fontFamily="Georgia,serif" textAnchor="middle">G</text>
          </svg>
        );

      // ── Swire Pacific Offshore ────────────────────────────────────────────
      case 'swire':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#003087"/>
            <polygon points="20,7 32.5,20 20,33 7.5,20" fill="#DC2626" stroke="#ffffff" strokeWidth="1.5"/>
            <polygon points="20,12 27.5,20 20,28 12.5,20" fill="#ffffff"/>
          </svg>
        );

      // ── Arkas Line ────────────────────────────────────────────────────────
      case 'arkas':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#0071C5"/>
            <path d="M6 32 C10 12, 26 8, 34 32 Z" fill="#ffffff"/>
            <path d="M12 32 C16 17, 28 14, 36 32 Z" fill="#003087"/>
          </svg>
        );

      // ── Sinokor Merchant Marine ───────────────────────────────────────────
      case 'sinokor':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#003087"/>
            <circle cx="20" cy="20" r="13" fill="#ffffff"/>
            <path d="M8 20 C8 13 20 13 20 20 C20 27 32 27 32 20"
              fill="none" stroke="#C8102E" strokeWidth="3.5" strokeLinecap="round"/>
            <circle cx="20" cy="20" r="3" fill="#003087"/>
          </svg>
        );

      // ── TS Lines ──────────────────────────────────────────────────────────
      case 'ts_lines':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#003087"/>
            <circle cx="20" cy="20" r="13" fill="#F7B500"/>
            <text x="20" y="26" fill="#003087" fontSize="13" fontWeight="900"
              fontFamily="Arial,sans-serif" textAnchor="middle">TS</text>
          </svg>
        );

      // ── Unifeeder ─────────────────────────────────────────────────────────
      case 'unifeeder':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#004B87"/>
            <polygon points="6,28 20,8 34,28 26,28 20,18 14,28" fill="#ffffff"/>
          </svg>
        );

      // ── Sea Lead Shipping ─────────────────────────────────────────────────
      case 'sea_lead':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#003087"/>
            <path d="M8 30 L22 8 L27 8 L14 30 Z" fill="#E30613"/>
            <path d="M16 30 L30 8 L35 8 L22 30 Z" fill="#ffffff"/>
          </svg>
        );

      // ── Thermal Arctic White — Reefer/Cold Chain ──────────────────────────
      // Ice-white · blue snowflake / cold-chain indicator
      case 'reefer_white':
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1.5"/>
            {/* Snowflake — 6-armed, 2px strokes */}
            <g stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round">
              <line x1="20" y1="7"  x2="20" y2="33"/>
              <line x1="7.3" y1="13.5" x2="32.7" y2="26.5"/>
              <line x1="7.3" y1="26.5" x2="32.7" y2="13.5"/>
              {/* Short branches */}
              {[0, 60, 120, 180, 240, 300].map((d, i) => {
                const r1 = (d * Math.PI) / 180;
                const r2a = ((d - 40) * Math.PI) / 180;
                const r2b = ((d + 40) * Math.PI) / 180;
                const x1 = 20 + 8 * Math.sin(r1), y1 = 20 - 8 * Math.cos(r1);
                return (
                  <g key={i}>
                    <line x1={x1} y1={y1} x2={x1 + 3.5 * Math.sin(r2a)} y2={y1 - 3.5 * Math.cos(r2a)}/>
                    <line x1={x1} y1={y1} x2={x1 + 3.5 * Math.sin(r2b)} y2={y1 - 3.5 * Math.cos(r2b)}/>
                  </g>
                );
              })}
            </g>
            <circle cx="20" cy="20" r="2.5" fill="#2563EB"/>
          </svg>
        );

      // ── Corten Steel / SOC (Shipper-Owned) ───────────────────────────────
      case 'corten_generic':
      default:
        return (
          <svg viewBox="0 0 40 40" width={pxSize} height={pxSize} className="flex-shrink-0" fill="none">
            <rect width="40" height="40" rx="8" fill="#B7410E"/>
            {/* Corrugation lines */}
            <line x1="0" y1="14" x2="40" y2="14" stroke="#7C2D12" strokeWidth="1"/>
            <line x1="0" y1="21" x2="40" y2="21" stroke="#7C2D12" strokeWidth="1"/>
            <line x1="0" y1="28" x2="40" y2="28" stroke="#7C2D12" strokeWidth="1"/>
            {/* Corner rivets */}
            <circle cx="6" cy="6"   r="2" fill="#FED7AA"/>
            <circle cx="34" cy="6"  r="2" fill="#FED7AA"/>
            <circle cx="6" cy="34"  r="2" fill="#FED7AA"/>
            <circle cx="34" cy="34" r="2" fill="#FED7AA"/>
            <text x="20" y="22" fill="#FED7AA" fontSize="10" fontWeight="900"
              fontFamily="monospace" textAnchor="middle" letterSpacing="0.5">SOC</text>
          </svg>
        );
    }
  };

  // Render variant
  if (variant === 'mark') {
    return (
      <div className={`inline-flex items-center justify-center rounded-lg overflow-hidden ${className}`}>
        {renderMark()}
      </div>
    );
  }

  if (variant === 'badge') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl border border-[var(--border)] bg-[var(--white)] shadow-sm ${className}`}
      >
        {renderMark()}
        <div className="flex flex-col text-left min-w-0">
          <span className="text-xs font-black text-[var(--ink)] tracking-tight leading-tight truncate">
            {line?.shortName || carrierName}
          </span>
          {line?.country && (
            <span className="text-[10px] font-semibold text-[var(--ink3)] leading-none truncate">
              {line.country} {line.alliance ? `· ${line.alliance}` : ''}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        {renderMark()}
        <div className="flex flex-col text-left min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-[var(--ink)] tracking-tight truncate">
              {line?.shortName || carrierName}
            </span>
            {line?.rank && (
              <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                #{line.rank} World
              </span>
            )}
          </div>
          <span className="text-[11px] text-[var(--ink3)] truncate">
            {line?.name || 'Container Carrier'}
          </span>
        </div>
      </div>
    );
  }

  // Full official corporate lockup
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border border-[var(--border)] bg-[var(--white)] shadow-sm ${className}`}>
      {renderMark()}
      <div className="flex flex-col text-left min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-[var(--ink)] tracking-tight">
              {line?.shortName || carrierName}
            </span>
            {line?.rank && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                Top {line.rank} Carrier
              </span>
            )}
          </div>
          {line?.alliance && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--ink2)] hidden sm:inline">
              {line.alliance}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--ink2)] font-medium truncate mt-0.5">
          {line?.name || 'Maritime Shipping Container Operator'}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--ink3)] font-mono">
          <span>BIC: {line?.bicPrefixes.slice(0, 4).join(', ')}</span>
          {line?.headquarters && <span>HQ: {line.headquarters}</span>}
        </div>
      </div>
    </div>
  );
};
