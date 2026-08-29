'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import React, { useRef, useState, useEffect } from 'react';
import Image from 'next/image';

// ─── Shared Logo — icon mark only ─────────────────────────────────────────────
export function ShieldLogo({
  size = 20,
  variant = 'color',
  className = ''
}: {
  size?: number;
  variant?: 'color' | 'white' | 'dark' | 'transparent';
  className?: string;
}) {
  if (variant === 'transparent') {
    return (
      <svg width={size} height={size} viewBox="0 0 3000 3000" fill="none" className={className}>
        <path d="M1500,414.97c208.63,0,377.95,169.32,377.95,377.95s-169.32,377.95-377.95,377.95-377.95-169.32-377.95-377.95,169.32-377.95,377.95-377.95Z" fill="currentColor" />
        <path d="M2203.95,2350.38c0,129.53-104.89,234.65-234.65,234.65s-234.65-105.12-234.65-234.65v-234.65c0-129.3-105.12-234.65-234.65-234.65s-234.65,105.37-234.65,234.65v234.65c0,129.53-104.89,234.65-234.65,234.65s-234.65-105.12-234.65-234.65v-234.65c0-388.12,315.85-703.97,703.97-703.97s703.97,315.85,703.97,703.97v234.65h-.02Z" fill="currentColor" />
      </svg>
    );
  }
  const src = variant === 'white' ? '/branding/bit-white.svg' : '/branding/icon.svg';
  return (
    <Image src={src} alt="Ondi" width={size} height={size} unoptimized className={className} />
  );
}


// ─── Unified Brand Logo with Typography ──────────────────────────────────────────
export function OndiBrand({
  size = 32,
  theme = 'light',
  className = ''
}: {
  size?: number;
  theme?: 'light' | 'dark';
  className?: string;
}) {
  const src = theme === 'dark' ? '/branding/logo-white.svg' : '/branding/logo-color.svg';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Ondi"
      style={{ height: `${size}px`, width: 'auto', display: 'block' }}
      className={className}
    />
  );
}

// ─── Design Tokens (Official Ondi Brand Palette) ──────────────────────────────────
export const OneColors = {
  primary: '#4253D1',      // Official Ondi Indigo Blue
  primaryLight: '#4E76E5', // Official Ondi Lighter Accent Blue
  navy: '#001633',         // Brand Deep Navy
  mist: '#ECEEFF',         // Brand Sky Mist
  border: '#D5D9F5',       // Subtle Indigo Gray-Blue
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  textPrimary: '#232323',  // Official Brand Charcoal Text
  textSecondary: '#4B5563', // Secondary Slate Text
};

// ─── Grid Background Animation ─────────────────────────────────────────────────
export function GridBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
      <div 
        className="absolute inset-0 opacity-[0.03]" 
        style={{ 
          backgroundImage: `linear-gradient(${OneColors.primary} 1px, transparent 1px), linear-gradient(90deg, ${OneColors.primary} 1px, transparent 1px)`,
          backgroundSize: '100px 100px'
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-white" />
    </div>
  );
}

// ─── Card Panel ───────────────────────────────────────────────────────────────
export function GlassPanel({ 
  children, 
  className = '', 
  hover = true,
  glow = false 
}: { 
  children: React.ReactNode; 
  className?: string;
  hover?: boolean;
  glow?: boolean;
}) {
  return (
    <motion.div
      whileHover={hover ? { y: -10, boxShadow: '0 40px 80px -15px rgba(30, 90, 175, 0.12)' } : {}}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={`
        relative overflow-hidden rounded-[10px] border border-slate-100 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all
        ${glow ? 'shadow-[0_0_50px_rgba(30,90,175,0.08)]' : ''}
        ${className}
      `}
    >
      {children as any}
    </motion.div>
  );
}

// ─── Progress Ring ────────────────────────────────────────────────────────────
export function HolographicRing({ 
  score, 
  max = 850, 
  label, 
  color = OneColors.primary,
  dark = false
}: {
  score: number; 
  max?: number; 
  label: string; 
  color?: string;
  dark?: boolean;
}) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1800; // 1.8 seconds smooth animation
    const end = score;
    if (start === end) return;
    const range = end - start;
    let current = start;
    const startTime = performance.now();
    
    let animationFrameId: number;
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4); // Ease-out quartic
      current = Math.floor(start + range * ease);
      setDisplayScore(current);
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplayScore(end);
      }
    };
    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [score]);

  const currentPct = displayScore / max;
  const finalPct = score / max;
  const r = 42;
  const circ = 2 * Math.PI * r;

  // Polar coordinate for glowing arc head dot
  const angle = -Math.PI / 2 + 2 * Math.PI * currentPct;
  const dotX = 50 + r * Math.cos(angle);
  const dotY = 50 + r * Math.sin(angle);

  return (
    <div className="relative flex flex-col items-center gap-4">
      <div className="relative w-40 h-40">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <defs>
            <filter id={`holographic-glow-${label}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background track circle */}
          <circle 
            cx="50" cy="50" r={r} 
            fill="none" 
            stroke={dark ? "rgba(255, 255, 255, 0.08)" : "#F1F5F9"} 
            strokeWidth="5" 
          />

          {/* Main animated progress arc */}
          <motion.circle
            cx="50" cy="50" r={r} 
            fill="none"
            stroke={color} 
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - finalPct) }}
            transition={{ duration: 1.8, ease: [0.23, 1, 0.32, 1] }}
          />

          {/* Holographic volumetric overlay glow circle */}
          <motion.circle
            cx="50" cy="50" r={r} 
            fill="none"
            stroke={color} 
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - finalPct) }}
            transition={{ duration: 1.8, ease: [0.23, 1, 0.32, 1] }}
            filter={`url(#holographic-glow-${label})`}
            opacity="0.6"
          />

          {/* High-tech glowing head dot */}
          {displayScore > 0 && (
            <circle 
              cx={dotX} 
              cy={dotY} 
              r="3.5" 
              fill={dark ? "#ffffff" : color} 
              filter={`url(#holographic-glow-${label})`}
            />
          )}
        </svg>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`text-4.5xl font-extrabold tracking-tighter font-barlow leading-none ${dark ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]' : 'text-[#001633]'}`}
          >
            {displayScore}
          </motion.span>
          <span className={`text-[10px] font-bold uppercase tracking-widest font-space mt-2 ${dark ? 'text-white/40' : 'text-slate-400'}`}>
            {label}
          </span>
        </div>
      </div>
      <div className={`w-20 h-1 blur-xl rounded-full ${dark ? 'bg-white/20' : 'bg-blue-500/10'}`} />
    </div>
  );
}

// ─── Info Card ───────────────────────────────────────────────────────────────
export function PremiumStatCard({ 
  label, 
  value, 
  sub, 
  icon: Icon,
  color = OneColors.primary 
}: {
  label: string; 
  value: string | number; 
  sub?: string; 
  icon?: React.ElementType;
  color?: string;
}) {
  return (
    <GlassPanel className="p-8 bg-white border-slate-50">
      <div className="flex items-start justify-between mb-8">
        <div className="w-12 h-12 rounded-[10px] bg-slate-50 flex items-center justify-center text-[#001633] shadow-sm">
          {Icon && <Icon size={24} />}
        </div>
        <div 
          className="w-2 h-2 rounded-full animate-pulse" 
          style={{ backgroundColor: color }}
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-wider text-slate-400 font-space">
          {label}
        </p>
        <p className="text-3xl font-bold text-[#001633] tracking-tight font-barlow uppercase">
          {value}
        </p>
        {sub && (
          <p className="text-sm text-slate-500 font-normal leading-relaxed">
            {sub}
          </p>
        )}
      </div>
    </GlassPanel>
  );
}

// ─── Visual Decoration ────────────────────────────────────────────────────────
export function FaceMesh({ className = '' }: { className?: string }) {
  return (
    <div className={`relative opacity-5 pointer-events-none ${className}`}>
      <svg width="200" height="240" viewBox="0 0 200 240" fill="none">
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={`h-${i}`} x1="0" y1={i * 20} x2="200" y2={i * 20} stroke={OneColors.primary} strokeWidth="0.5" />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`v-${i}`} x1={i * 20} y1="0" x2={i * 20} y2="240" stroke={OneColors.primary} strokeWidth="0.5" />
        ))}
      </svg>
    </div>
  );
}

// ─── Brand Watermark Background Component ─────────────────────────────────────
export function BrandWatermark({ 
  className = '', 
  opacity = 0.03,
  size = '100%',
  color = '#4253D1',
  useImage = false
}: { 
  className?: string; 
  opacity?: number;
  size?: number | string;
  color?: string;
  useImage?: boolean;
}) {
  if (useImage) {
    return (
      <div 
        className={`pointer-events-none select-none ${className}`}
        style={{ 
          backgroundImage: `url('/branding/watermark.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity 
        }}
      />
    );
  }

  return (
    <div className={`absolute pointer-events-none overflow-hidden ${className}`}>
      <svg width={size} height={size} viewBox="0 0 3000 3000" fill="none" opacity={opacity} className="w-full h-full max-w-none">
        <path d="M2989.14,1240.32c3.23,81.36,4.7,167.82,4.7,259.68,0,179.2-5.6,337.88-18.97,478.23-68.63-454.4-326.13-857.19-693.19-1097.74,19.58-73.31,35.85-148.12,48.59-224.24,213.97,124.38,402.75,297.29,549.78,510.92,29.35,42.66,65.63,71.75,109.09,73.15Z" fill="#e6e7e8" />
        <path d="M2989.14,1240.32l-30.75-356.07c15.68,106.18,25.52,224.46,30.75,356.07Z" fill={color} />
        <path d="M2958.39,884.25l30.75,356.07c-43.46-1.4-79.73-30.49-109.09-73.15-147.04-213.63-335.81-386.54-549.78-510.92,13.74-82.1,23.39-165.71,28.72-250.58,80.83,41.64,159.67,89.58,235.88,143.86,135.88,96.82,257.37,208.55,363.52,334.72Z" fill={color} />
        <path d="M2974.87,1978.23h0c-40.46,425.03-152.15,681.9-395.38,830.95-67.1,17.92-138.75,23.01-212.06,12.4-273.43-39.55-469.45-275.15-477.73-548.65-1.57-52.13,1.45-102.2-5.47-153.32-12.77-94.34-59.8-179.93-128.6-242-4.75-4.29-9.58-8.43-14.47-12.43,52.36-56.36,101.98-115.59,148.64-177.49,138.51,112.86,228.34,276.54,232.16,431.56l4.35,176.21c3.28,132.99,100.83,247.47,229.91,284.49,173.98,49.88,344.86-55.49,391.93-225.92,20.89-75.59,14.66-143.07,8.93-222.58-21.95-304.57-137.12-594.72-338.16-824.43-63.89-73-134.99-138.38-212.02-194.68,28.66-75.37,53.65-152.74,74.78-231.85,367.06,240.55,624.56,643.34,693.19,1097.74Z" fill={color} />
        <path d="M2842.87,481.32c54.71,109.53,91.79,242.41,115.52,402.94-106.15-126.17-227.63-237.9-363.52-334.72-76.21-54.29-155.04-102.23-235.88-143.86,3.25-51.57,4.89-103.61,4.89-156.06,0-16.7-.16-33.38-.51-50,123.19,69.74,238.87,154.47,345.15,250.52,40.17,36.3,89.3,50.58,134.34,31.18Z" fill="#e6e7e8" />
        <path d="M2842.87,481.32c-45.04,19.41-94.17,5.13-134.34-31.18-106.28-96.05-221.96-180.78-345.15-250.52-.69-35.26-2.14-70.33-4.33-105.19,233.2,71.06,386.44,191.99,483.83,386.89Z" fill={color} />
        <path d="M2757.08,2131.45c5.73,79.51,11.96,146.99-8.93,222.58-47.07,170.42-217.95,275.79-391.93,225.92-129.08-37.02-226.64-151.5-229.91-284.49l-4.35-176.21c-3.82-155.01-93.65-318.69-232.16-431.56,42.49-56.34,82.52-114.86,119.93-175.4,11.15,9.05,22.13,18.44,32.92,28.16,174.71,157.32,277.7,382.46,280.85,619.92,1.04,78.34,43.19,147.56,129.92,142.82,31.94-1.75,61.5-22.67,81.55-47.22,35.5-43.44,25.77-91.97,21.83-145.86-20.61-282.32-143.95-548.18-353.23-738.25-26-23.62-52.7-45.75-80.06-66.39,30.49-62.73,58.34-127.16,83.39-193.12,77.03,56.3,148.12,121.68,212.02,194.68,201.04,229.71,316.21,519.85,338.16,824.43Z" fill="#e6e7e8" />
        <path d="M2556.8,2110.1c3.94,53.89,13.66,102.42-21.83,145.86-20.05,24.55-49.61,45.47-81.55,47.22-86.73,4.75-128.88-64.48-129.92-142.82-3.14-237.46-106.13-462.6-280.85-619.92-10.8-9.73-21.77-19.11-32.92-28.16,41.18-66.58,79.17-135.6,113.79-206.82,27.36,20.64,54.05,42.77,80.06,66.39,209.28,190.07,332.62,455.93,353.23,738.25Z" fill={color} />
        <path d="M2367.43,2821.58c73.31,10.61,144.96,5.52,212.06-12.4-107.84,66.1-241.53,110.98-406.34,139.94-12.06-3.48-24.14-7.68-36.3-12.77-110.95-46.32-206.35-116.99-285.53-208.86-144.29-167.41-236.41-372.08-242.56-594.87-1.19-42.83-8.49-78.81-35.01-105.13,58.46-50.95,114.35-105.15,167.43-162.31,4.89,4,9.73,8.14,14.47,12.43,68.8,62.07,115.83,147.67,128.6,242,6.92,51.13,3.89,101.2,5.47,153.32,8.29,273.5,204.3,509.1,477.73,548.65Z" fill="#e6e7e8" />
        <path d="M2363.37,199.62c.35,16.62.51,33.29.51,50,0,52.45-1.65,104.49-4.89,156.06C1668.73,50.1,832.2,153.71,237.5,683.01c-71.15,63.32-135.85,130.57-196.02,202.03,23.73-160.96,60.87-294.16,115.74-403.89,42.68,18.11,92.35,7.74,131.21-27.74C524.37,237.9,809.35,78.65,1119.51,17.25c115.2-7.73,241.69-11.09,380.49-11.09s263.42,3.31,377.93,10.9c170.84,33.61,333.83,96.73,485.44,182.56Z" fill="#e6e7e8" />
        <path d="M2359.04,94.42c2.19,34.86,3.64,69.93,4.33,105.19-151.62-85.83-314.61-148.95-485.44-182.56,189.32,12.56,348.21,36.86,481.11,77.37Z" fill={color} />
        <path d="M2358.99,405.67c-5.33,84.87-14.99,168.49-28.72,250.58-387.2-225.09-856.88-291.28-1311-152.31-367.84,112.57-682.23,347.17-899.03,663.36-28.8,41.99-66.76,71.24-109.38,73.06,5.22-131.3,15.01-249.35,30.63-355.33,60.16-71.46,124.87-138.7,196.02-202.03C832.2,153.71,1668.73,50.1,2358.99,405.67Z" fill={color} />
        <path d="M2330.27,656.25c-12.74,76.12-29,150.93-48.59,224.24-250.88-164.4-552.94-253.02-880.87-230.53-326.88,22.43-631.73,151.85-876.64,370.32C243.17,1270.97,74.4,1604.77,22.99,1955.16c-11.84-134.61-16.84-285.73-16.84-455.17,0-91.84,1.47-178.28,4.7-259.63,42.62-1.82,80.58-31.07,109.38-73.06,216.81-316.2,531.2-550.79,899.03-663.36,454.12-138.97,923.8-72.78,1311,152.31Z" fill="#e6e7e8" />
        <path d="M2281.68,880.49c-21.13,79.12-46.12,156.48-74.78,231.85-170.97-124.95-371.17-205.2-586.77-224.9-351.21-32.09-678.72,74.22-941.86,308.39-303.31,269.92-466.6,682.11-435.45,1087.12,6.77,88.12,21.77,174.44,44.71,258.09-22.33.75-44.75,1.12-67.24,1.12-17.15,0-34.25-.22-51.32-.65-79.35-147.31-124.2-338.97-145.98-586.35,51.41-350.4,220.19-684.2,501.18-934.88,244.91-218.47,549.77-347.89,876.64-370.32,327.93-22.49,630,66.13,880.87,230.53Z" fill={color} />
        <path d="M2206.9,1112.34c-25.05,65.97-52.91,130.39-83.39,193.12-212.56-160.36-464.48-230.25-736.13-202.78-224.03,22.68-424.8,118.55-590.74,269.12-207.98,188.72-330.17,450.99-353.23,731.12-11.49,139.5,11.64,283.71,55.96,419.96-69.61,9.68-140.29,15.79-211.84,18.14-22.93-83.65-37.93-169.97-44.71-258.09-31.15-405.01,132.14-817.2,435.45-1087.12,263.14-234.17,590.65-340.48,941.86-308.39,215.6,19.7,415.81,99.95,586.77,224.9Z" fill="#e6e7e8" />
        <path d="M2136.84,2936.35c12.16,5.08,24.24,9.29,36.3,12.77-112.47,19.76-239.43,32.1-382.56,38.68-115.39-98.39-208.26-218.86-282.21-354.98-64.5-118.67-115.08-243.71-124.66-378.08l-5.39-75.59c67.86-46.66,133.09-97.33,195.42-151.66,26.52,26.33,33.82,62.31,35.01,105.13,6.16,222.79,98.27,427.46,242.56,594.87,79.19,91.87,174.58,162.53,285.53,208.86Z" fill="#e6e7e8" />
        <path d="M2123.51,1305.47c-34.61,71.21-72.61,140.23-113.79,206.82-309.17-251.36-745.3-245.54-1050.08,26.45-195.28,174.26-296.07,427.02-283.42,686.52,4.04,82.79,23.48,167.63,53.35,251.82-75.25,19.61-152.06,34.98-230.21,45.84-44.33-136.25-67.45-280.47-55.96-419.96,23.07-280.13,145.26-542.4,353.23-731.12,165.94-150.58,366.71-246.44,590.74-269.12,271.65-27.47,523.57,42.42,736.13,202.78Z" fill={color} />
        <path d="M2009.73,1512.28c-37.41,60.54-77.44,119.06-119.93,175.4-93.47-76.16-209.11-129.18-335.46-140.79-230.37-21.16-442.93,95.25-564.21,290.98-62.44,100.81-95.91,211.09-109.29,329.98-9.01,79.92.22,169.68,20.3,256.22-56.18,20.13-113.42,37.83-171.57,52.98-29.87-84.18-49.31-169.03-53.35-251.82-12.65-259.5,88.14-512.26,283.42-686.52,304.78-271.99,740.91-277.81,1050.08-26.45Z" fill="#e6e7e8" />
        <path d="M1889.8,1687.69c-46.66,61.9-96.28,121.13-148.64,177.49-164.4-134.69-406.83-113.36-536.56,72.03-85.43,122.09-105.22,258.96-84.1,393.58-71.09,35.25-144.3,66.44-219.36,93.29-20.08-86.55-29.31-176.3-20.3-256.22,13.38-118.89,46.85-229.16,109.29-329.98,121.28-195.74,333.84-312.14,564.21-290.98,126.35,11.61,241.99,64.63,335.46,140.79Z" fill={color} />
        <path d="M1790.58,2987.8c-81.76,3.78-168.79,5.67-261.41,5.99h-.01c-104.05-92.31-194.68-199.5-270.68-318.31-67.05-104.87-119-223.87-137.97-344.7,89.46-44.31,175.55-95.04,257.81-151.63l5.39,75.59c9.58,134.37,60.16,259.41,124.66,378.08,73.96,136.12,166.82,256.59,282.21,354.98Z" fill="#e6e7e8" />
        <path d="M1741.16,1865.18c-53.08,57.17-108.97,111.36-167.43,162.31-7.38-7.32-16.23-13.9-26.87-19.67-39.23-21.3-93.88-17.63-131.2,12.8-36.35,29.65-43.16,76.9-39.65,126.1l2.31,32.44c-82.26,56.59-168.35,107.32-257.81,151.63-21.13-134.62-1.34-271.49,84.1-393.58,129.73-185.4,372.16-206.73,536.56-72.03Z" fill="#e6e7e8" />
        <path d="M1546.86,2007.82c10.64,5.77,19.5,12.36,26.87,19.67-62.32,54.33-127.55,105-195.42,151.66l-2.31-32.44c-3.51-49.2,3.31-96.45,39.65-126.1,37.32-30.43,91.97-34.1,131.2-12.8Z" fill={color} />
        <path d="M1529.16,2993.8c-9.67.03-19.38.04-29.16.04-107.54,0-207.71-2.01-300.95-6.52-97.89-115.82-177.39-240.18-237.98-380.52-23.98-55.52-44.97-118.22-59.93-182.72,75.06-26.86,148.27-58.05,219.36-93.29,18.97,120.82,70.92,239.83,137.97,344.7,76,118.81,166.63,226,270.68,318.31Z" fill={color} />
        <path d="M1199.05,2987.32c-66.82-3.22-130.07-7.71-189.95-13.66-108.23-145.9-216.84-319.81-279.53-496.6,58.15-15.15,115.39-32.85,171.57-52.98,14.96,64.5,35.95,127.2,59.93,182.72,60.59,140.34,140.09,264.7,237.98,380.52Z" fill="#e6e7e8" />
        <path d="M729.57,2477.06c62.69,176.79,171.29,350.69,279.53,496.6-119.41-11.87-225.39-29.49-319.3-54.26h-.01c-40.75-66.99-78.51-135.91-113.1-206.43-29.69-60.56-55.98-124.4-77.32-190.07,78.15-10.86,154.95-26.22,230.21-45.84Z" fill={color} />
        <path d="M1119.51,17.25c-310.16,61.4-595.13,220.66-831.07,436.15-38.86,35.48-88.53,45.85-131.21,27.74C309.86,175.8,599.71,52.08,1119.51,17.25Z" fill="#e6e7e8" />
        <path d="M576.69,2712.97c34.58,70.52,72.34,139.44,113.1,206.43-123.35-32.5-225.87-77.31-310.69-137.53-38.17-77.09-68.79-157.64-91.57-240.83,71.55-2.35,142.23-8.46,211.84-18.14,21.35,65.67,47.63,129.51,77.32,190.07Z" fill="#e6e7e8" />
      </svg>
    </div>
  );
}

