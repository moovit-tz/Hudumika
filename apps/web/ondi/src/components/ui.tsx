'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Shared Logo ──────────────────────────────────────────────────────────────
export function ShieldLogo({ 
  size = 20, 
  variant = 'color',
  className = ''
}: { 
  size?: number; 
  variant?: 'color' | 'white' | 'dark' | 'transparent';
  className?: string;
}) {
  const brandPrimary = variant === 'white' ? '#ffffff' : variant === 'dark' ? '#232323' : '#4253D1';
  const brandAccent = variant === 'white' ? 'rgba(255,255,255,0.7)' : variant === 'dark' ? 'rgba(35,35,35,0.7)' : '#4E76E5';
  const emblemFill = variant === 'color' ? '#ffffff' : variant === 'white' ? '#4253D1' : '#ffffff';

  if (variant === 'transparent') {
    return (
      <svg width={size} height={size} viewBox="0 0 3000 3000" fill="none" className={className}>
        <path d="M1500,414.97c208.63,0,377.95,169.32,377.95,377.95s-169.32,377.95-377.95,377.95-377.95-169.32-377.95-377.95,169.32-377.95,377.95-377.95Z" fill="currentColor" />
        <path d="M2203.95,2350.38c0,129.53-104.89,234.65-234.65,234.65s-234.65-105.12-234.65-234.65v-234.65c0-129.3-105.12-234.65-234.65-234.65s-234.65,105.37-234.65,234.65v234.65c0,129.53-104.89,234.65-234.65,234.65s-234.65-105.12-234.65-234.65v-234.65c0-388.12,315.85-703.97,703.97-703.97s703.97,315.85,703.97,703.97v234.65h-.02Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 3000 3000" fill="none" className={className}>
      <path d="M3000,1500c0,1235.25-264.75,1500-1500,1500-752.42,0-1144.76-98.23-1336.51-454.2,17.14.44,34.31.66,51.53.66,1188.76,0,2152.42-1030.63,2152.42-2301.99,0-52.37-1.63-104.33-4.86-155.82,506.63,154.38,637.42,543.16,637.42,1411.36Z" fill={brandPrimary} />
      <path d="M2367.44,244.46c0,1271.36-963.66,2301.99-2152.42,2301.99-17.22,0-34.4-.22-51.53-.66C40.45,2317.38,0,1982.83,0,1500,0,264.75,264.75,0,1500,0,1867.05,0,2148.41,23.37,2362.58,88.64c3.23,51.49,4.86,103.45,4.86,155.82Z" fill={brandAccent} />
      <g opacity="0.08">
        <path d="M2989.14,1240.32c3.23,81.36,4.7,167.82,4.7,259.68,0,179.2-5.6,337.88-18.97,478.23-68.63-454.4-326.13-857.19-693.19-1097.74,19.58-73.31,35.85-148.12,48.59-224.24,213.97,124.38,402.75,297.29,549.78,510.92,29.35,42.66,65.63,71.75,109.09,73.15Z" fill="#e6e7e8" />
        <path d="M2989.14,1240.32l-30.75-356.07c15.68,106.18,25.52,224.46,30.75,356.07Z" fill="#4253d1" />
        <path d="M2958.39,884.25l30.75,356.07c-43.46-1.4-79.73-30.49-109.09-73.15-147.04-213.63-335.81-386.54-549.78-510.92,13.74-82.1,23.39-165.71,28.72-250.58,80.83,41.64,159.67,89.58,235.88,143.86,135.88,96.82,257.37,208.55,363.52,334.72Z" fill="#4253d1" />
        <path d="M2974.87,1978.23h0c-40.46,425.03-152.15,681.9-395.38,830.95-67.1,17.92-138.75,23.01-212.06,12.4-273.43-39.55-469.45-275.15-477.73-548.65-1.57-52.13,1.45-102.2-5.47-153.32-12.77-94.34-59.8-179.93-128.6-242-4.75-4.29-9.58-8.43-14.47-12.43,52.36-56.36,101.98-115.59,148.64-177.49,138.51,112.86,228.34,276.54,232.16,431.56l4.35,176.21c3.28,132.99,100.83,247.47,229.91,284.49,173.98,49.88,344.86-55.49,391.93-225.92,20.89-75.59,14.66-143.07,8.93-222.58-21.95-304.57-137.12-594.72-338.16-824.43-63.89-73-134.99-138.38-212.02-194.68,28.66-75.37,53.65-152.74,74.78-231.85,367.06,240.55,624.56,643.34,693.19,1097.74Z" fill="#4253d1" />
        <path d="M2842.87,481.32c54.71,109.53,91.79,242.41,115.52,402.94-106.15-126.17-227.63-237.9-363.52-334.72-76.21-54.29-155.04-102.23-235.88-143.86,3.25-51.57,4.89-103.61,4.89-156.06,0-16.7-.16-33.38-.51-50,123.19,69.74,238.87,154.47,345.15,250.52,40.17,36.3,89.3,50.58,134.34,31.18Z" fill="#e6e7e8" />
        <path d="M2842.87,481.32c-45.04,19.41-94.17,5.13-134.34-31.18-106.28-96.05-221.96-180.78-345.15-250.52-.69-35.26-2.14-70.33-4.33-105.19,233.2,71.06,386.44,191.99,483.83,386.89Z" fill="#4253d1" />
        <path d="M2757.08,2131.45c5.73,79.51,11.96,146.99-8.93,222.58-47.07,170.42-217.95,275.79-391.93,225.92-129.08-37.02-226.64-151.5-229.91-284.49l-4.35-176.21c-3.82-155.01-93.65-318.69-232.16-431.56,42.49-56.34,82.52-114.86,119.93-175.4,11.15,9.05,22.13,18.44,32.92,28.16,174.71,157.32,277.7,382.46,280.85,619.92,1.04,78.34,43.19,147.56,129.92,142.82,31.94-1.75,61.5-22.67,81.55-47.22,35.5-43.44,25.77-91.97,21.83-145.86-20.61-282.32-143.95-548.18-353.23-738.25-26-23.62-52.7-45.75-80.06-66.39,30.49-62.73,58.34-127.16,83.39-193.12,77.03,56.3,148.12,121.68,212.02,194.68,201.04,229.71,316.21,519.85,338.16,824.43Z" fill="#e6e7e8" />
        <path d="M2556.8,2110.1c3.94,53.89,13.66,102.42-21.83,145.86-20.05,24.55-49.61,45.47-81.55,47.22-86.73,4.75-128.88-64.48-129.92-142.82-3.14-237.46-106.13-462.6-280.85-619.92-10.8-9.73-21.77-19.11-32.92-28.16,41.18-66.58,79.17-135.6,113.79-206.82,27.36,20.64,54.05,42.77,80.06,66.39,209.28,190.07,332.62,455.93,353.23,738.25Z" fill="#4253d1" />
        <path d="M2367.43,2821.58c73.31,10.61,144.96,5.52,212.06-12.4-107.84,66.1-241.53,110.98-406.34,139.94-12.06-3.48-24.14-7.68-36.3-12.77-110.95-46.32-206.35-116.99-285.53-208.86-144.29-167.41-236.41-372.08-242.56-594.87-1.19-42.83-8.49-78.81-35.01-105.13,58.46-50.95,114.35-105.15,167.43-162.31,4.89,4,9.73,8.14,14.47,12.43,68.8,62.07,115.83,147.67,128.6,242,6.92,51.13,3.89,101.2,5.47,153.32,8.29,273.5,204.3,509.1,477.73,548.65Z" fill="#e6e7e8" />
        <path d="M2363.37,199.62c.35,16.62.51,33.29.51,50,0,52.45-1.65,104.49-4.89,156.06C1668.73,50.1,832.2,153.71,237.5,683.01c-71.15,63.32-135.85,130.57-196.02,202.03,23.73-160.96,60.87-294.16,115.74-403.89,42.68,18.11,92.35,7.74,131.21-27.74C524.37,237.9,809.35,78.65,1119.51,17.25c115.2-7.73,241.69-11.09,380.49-11.09s263.42,3.31,377.93,10.9c170.84,33.61,333.83,96.73,485.44,182.56Z" fill="#e6e7e8" />
        <path d="M2359.04,94.42c2.19,34.86,3.64,69.93,4.33,105.19-151.62-85.83-314.61-148.95-485.44-182.56,189.32,12.56,348.21,36.86,481.11,77.37Z" fill="#4e76e5" />
        <path d="M2358.99,405.67c-5.33,84.87-14.99,168.49-28.72,250.58-387.2-225.09-856.88-291.28-1311-152.31-367.84,112.57-682.23,347.17-899.03,663.36-28.8,41.99-66.76,71.24-109.38,73.06,5.22-131.3,15.01-249.35,30.63-355.33,60.16-71.46,124.87-138.7,196.02-202.03C832.2,153.71,1668.73,50.1,2358.99,405.67Z" fill="#4e76e5" />
        <path d="M2330.27,656.25c-12.74,76.12-29,150.93-48.59,224.24-250.88-164.4-552.94-253.02-880.87-230.53-326.88,22.43-631.73,151.85-876.64,370.32C243.17,1270.97,74.4,1604.77,22.99,1955.16c-11.84-134.61-16.84-285.73-16.84-455.17,0-91.84,1.47-178.28,4.7-259.63,42.62-1.82,80.58-31.07,109.38-73.06,216.81-316.2,531.2-550.79,899.03-663.36,454.12-138.97,923.8-72.78,1311,152.31Z" fill="#e6e7e8" />
        <path d="M2281.68,880.49c-21.13,79.12-46.12,156.48-74.78,231.85-170.97-124.95-371.17-205.2-586.77-224.9-351.21-32.09-678.72,74.22-941.86,308.39-303.31,269.92-466.6,682.11-435.45,1087.12,6.77,88.12,21.77,174.44,44.71,258.09-22.33.75-44.75,1.12-67.24,1.12-17.15,0-34.25-.22-51.32-.65-79.35-147.31-124.2-338.97-145.98-586.35,51.41-350.4,220.19-684.2,501.18-934.88,244.91-218.47,549.77-347.89,876.64-370.32,327.93-22.49,630,66.13,880.87,230.53Z" fill="#4e76e5" />
        <path d="M2206.9,1112.34c-25.05,65.97-52.91,130.39-83.39,193.12-212.56-160.36-464.48-230.25-736.13-202.78-224.03,22.68-424.8,118.55-590.74,269.12-207.98,188.72-330.17,450.99-353.23,731.12-11.49,139.5,11.64,283.71,55.96,419.96-69.61,9.68-140.29,15.79-211.84,18.14-22.93-83.65-37.93-169.97-44.71-258.09-31.15-405.01,132.14-817.2,435.45-1087.12,263.14-234.17,590.65-340.48,941.86-308.39,215.6,19.7,415.81,99.95,586.77,224.9Z" fill="#e6e7e8" />
        <path d="M2136.84,2936.35c12.16,5.08,24.24,9.29,36.3,12.77-112.47,19.76-239.43,32.1-382.56,38.68-115.39-98.39-208.26-218.86-282.21-354.98-64.5-118.67-115.08-243.71-124.66-378.08l-5.39-75.59c67.86-46.66,133.09-97.33,195.42-151.66,26.52,26.33,33.82,62.31,35.01,105.13,6.16,222.79,98.27,427.46,242.56,594.87,79.19,91.87,174.58,162.53,285.53,208.86Z" fill="#e6e7e8" />
        <path d="M2123.51,1305.47c-34.61,71.21-72.61,140.23-113.79,206.82-309.17-251.36-745.3-245.54-1050.08,26.45-195.28,174.26-296.07,427.02-283.42,686.52,4.04,82.79,23.48,167.63,53.35,251.82-75.25,19.61-152.06,34.98-230.21,45.84-44.33-136.25-67.45-280.47-55.96-419.96,23.07-280.13,145.26-542.4,353.23-731.12,165.94-150.58,366.71-246.44,590.74-269.12,271.65-27.47,523.57,42.42,736.13,202.78Z" fill="#4e76e5" />
        <path d="M2009.73,1512.28c-37.41,60.54-77.44,119.06-119.93,175.4-93.47-76.16-209.11-129.18-335.46-140.79-230.37-21.16-442.93,95.25-564.21,290.98-62.44,100.81-95.91,211.09-109.29,329.98-9.01,79.92.22,169.68,20.3,256.22-56.18,20.13-113.42,37.83-171.57,52.98-29.87-84.18-49.31-169.03-53.35-251.82-12.65-259.5,88.14-512.26,283.42-686.52,304.78-271.99,740.91-277.81,1050.08-26.45Z" fill="#e6e7e8" />
        <path d="M1889.8,1687.69c-46.66,61.9-96.28,121.13-148.64,177.49-164.4-134.69-406.83-113.36-536.56,72.03-85.43,122.09-105.22,258.96-84.1,393.58-71.09,35.25-144.3,66.44-219.36,93.29-20.08-86.55-29.31-176.3-20.3-256.22,13.38-118.89,46.85-229.16,109.29-329.98,121.28-195.74,333.84-312.14,564.21-290.98,126.35,11.61,241.99,64.63,335.46,140.79Z" fill="#4e76e5" />
        <path d="M1790.58,2987.8c-81.76,3.78-168.79,5.67-261.41,5.99h-.01c-104.05-92.31-194.68-199.5-270.68-318.31-67.05-104.87-119-223.87-137.97-344.7,89.46-44.31,175.55-95.04,257.81-151.63l5.39,75.59c9.58,134.37,60.16,259.41,124.66,378.08,73.96,136.12,166.82,256.59,282.21,354.98Z" fill="#e6e7e8" />
        <path d="M1741.16,1865.18c-53.08,57.17-108.97,111.36-167.43,162.31-7.38-7.32-16.23-13.9-26.87-19.67-39.23-21.3-93.88-17.63-131.2,12.8-36.35,29.65-43.16,76.9-39.65,126.1l2.31,32.44c-82.26,56.59-168.35,107.32-257.81,151.63-21.13-134.62-1.34-271.49,84.1-393.58,129.73-185.4,372.16-206.73,536.56-72.03Z" fill="#e6e7e8" />
        <path d="M1546.86,2007.82c10.64,5.77,19.5,12.36,26.87,19.67-62.32,54.33-127.55,105-195.42,151.66l-2.31-32.44c-3.51-49.2,3.31-96.45,39.65-126.1,37.32-30.43,91.97-34.1,131.2-12.8Z" fill="#4e76e5" />
        <path d="M1529.16,2993.8c-9.67.03-19.38.04-29.16.04-107.54,0-207.71-2.01-300.95-6.52-97.89-115.82-177.39-240.18-237.98-380.52-23.98-55.52-44.97-118.22-59.93-182.72,75.06-26.86,148.27-58.05,219.36-93.29,18.97,120.82,70.92,239.83,137.97,344.7,76,118.81,166.63,226,270.68,318.31Z" fill="#4253d1" />
        <path d="M1199.05,2987.32c-66.82-3.22-130.07-7.71-189.95-13.66-108.23-145.9-216.84-319.81-279.53-496.6,58.15-15.15,115.39-32.85,171.57-52.98,14.96,64.5,35.95,127.2,59.93,182.72,60.59,140.34,140.09,264.7,237.98,380.52Z" fill="#e6e7e8" />
        <path d="M729.57,2477.06c62.69,176.79,171.29,350.69,279.53,496.6-119.41-11.87-225.39-29.49-319.3-54.26h-.01c-40.75-66.99-78.51-135.91-113.1-206.43-29.69-60.56-55.98-124.4-77.32-190.07,78.15-10.86,154.95-26.22,230.21-45.84Z" fill="#4253d1" />
        <path d="M1119.51,17.25c-310.16,61.4-595.13,220.66-831.07,436.15-38.86,35.48-88.53,45.85-131.21,27.74C309.86,175.8,599.71,52.08,1119.51,17.25Z" fill="#e6e7e8" />
        <path d="M576.69,2712.97c34.58,70.52,72.34,139.44,113.1,206.43-123.35-32.5-225.87-77.31-310.69-137.53-38.17-77.09-68.79-157.64-91.57-240.83,71.55-2.35,142.23-8.46,211.84-18.14,21.35,65.67,47.63,129.51,77.32,190.07Z" fill="#e6e7e8" />
        <path d="M287.53,2541.04c22.79,83.18,53.4,163.74,91.57,240.83-87.93-62.41-156.82-141.38-210.14-240.36,17.07.43,34.17.65,51.32.65,22.49,0,44.91-.37,67.24-1.12Z" fill="#4253d1" />
      </g>
      <path d="M1532.8,268.56c208.63,0,377.95,169.32,377.95,377.95s-169.32,377.95-377.95,377.95-377.95-169.32-377.95-377.95,169.32-377.95,377.95-377.95Z" fill={emblemFill} />
      <path d="M2236.75,2203.97c0,129.53-104.89,234.65-234.65,234.65s-234.65-105.12-234.65-234.65v-234.65c0-129.3-105.12-234.65-234.65-234.65s-234.65,105.37-234.65,234.65v234.65c0,129.53-104.89,234.65-234.65,234.65s-234.65-105.12-234.65-234.65v-234.65c0-388.12,315.85-703.97,703.97-703.97s703.97,315.85,703.97,703.97v234.65h-.02Z" fill={emblemFill} />
    </svg>
  );
}

// ─── Trust Badge ──────────────────────────────────────────────────────────────
export function TrustBadge({
  score,
  tier,
}: {
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
}) {
  const config = {
    HIGH:   { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400', label: 'High Trust' },
    MEDIUM: { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400',   label: 'Medium Trust' },
    LOW:    { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     dot: 'bg-red-400',     label: 'Low Trust' },
  }[tier];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${config.bg} ${config.color} ${config.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} animate-pulse`} />
      {score} · {config.label}
    </span>
  );
}

// ─── Verification Badge ───────────────────────────────────────────────────────
export function VerificationBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    L0_UNVERIFIED:       { label: 'Unverified',       color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
    L1_BASIC_KYC:        { label: 'Basic KYC',        color: 'text-blue-400',  bg: 'bg-blue-500/10',  border: 'border-blue-500/20'  },
    L2_GOV_VERIFIED:     { label: 'Gov. Verified',    color: 'text-indigo-400',bg: 'bg-indigo-500/10',border: 'border-indigo-500/20'},
    L3_FINANCIAL_VERIFIED:{ label: 'Financial Grade', color: 'text-purple-400',bg: 'bg-purple-500/10',border: 'border-purple-500/20'},
  };
  const c = map[level] ?? map.L0_UNVERIFIED;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${c.bg} ${c.color} ${c.border}`}>
      {level !== 'L0_UNVERIFIED' && <span>✓</span>}
      {c.label}
    </span>
  );
}

// ─── Score Ring ───────────────────────────────────────────────────────────────
export function ScoreRing({ score, max = 850, label, color = '#6366f1' }: {
  score: number; max?: number; label: string; color?: string;
}) {
  const pct = score / max;
  const r = 44, circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
          <motion.circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - pct) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{score}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, accent = '#6366f1' }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[10px] border border-white/8 bg-white/3 p-5 flex flex-col gap-1"
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{label}</span>
      <span className="text-2xl font-bold text-white">{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </motion.div>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────────
export function AlertCard({ type, severity, description, status, createdAt }: {
  type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; description: string;
  status: string; createdAt: string;
}) {
  const s = {
    HIGH:   'text-red-400 bg-red-500/10 border-red-500/30',
    MEDIUM: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    LOW:    'text-slate-400 bg-slate-500/10 border-slate-500/30',
  }[severity];

  return (
    <div className="flex items-start gap-3 p-4 rounded-[10px] border border-white/8 bg-white/3 hover:bg-white/5 transition-colors">
      <span className={`mt-0.5 px-2 py-0.5 rounded-[10px] text-[10px] font-bold border ${s} shrink-0`}>{severity}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{type.replace(/_/g, ' ')}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        status === 'OPEN' ? 'bg-red-500/10 text-red-400' :
        status === 'INVESTIGATING' ? 'bg-amber-500/10 text-amber-400' :
        'bg-emerald-500/10 text-emerald-400'
      }`}>{status}</span>
    </div>
  );
}

// ─── KYC Status Row ───────────────────────────────────────────────────────────
export function KYCRow({ name, docType, status, submittedAt, onApprove, onReject }: {
  name: string; docType: string; status: string; submittedAt: string;
  onApprove?: () => void; onReject?: () => void;
}) {
  const statusColor = {
    PENDING: 'text-amber-400 bg-amber-500/10',
    REVIEW:  'text-blue-400 bg-blue-500/10',
    VERIFIED:'text-emerald-400 bg-emerald-500/10',
    REJECTED:'text-red-400 bg-red-500/10',
    FAILED:  'text-red-400 bg-red-500/10',
  }[status] ?? 'text-slate-400 bg-slate-500/10';

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-[10px] border border-white/8 bg-white/3 hover:bg-white/5 transition-colors">
      <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold text-sm shrink-0">
        {name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{name}</p>
        <p className="text-xs text-slate-500">{docType} · {submittedAt}</p>
      </div>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColor}`}>{status}</span>
      {(status === 'PENDING' || status === 'REVIEW') && (
        <div className="flex gap-2 shrink-0">
          <button onClick={onApprove} className="px-3 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-[10px] hover:bg-emerald-500/20 transition-colors">Approve</button>
          <button onClick={onReject}  className="px-3 py-1 text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30 rounded-[10px] hover:bg-red-500/20 transition-colors">Reject</button>
        </div>
      )}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
export function SectionHeader({ title, sub, action }: {
  title: string; sub?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange }: {
  tabs: string[]; active: string; onChange: (t: string) => void;
}) {
  return (
    <div className="flex gap-1 bg-white/5 p-1 rounded-[10px] border border-white/8 w-fit">
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-1.5 text-sm font-semibold rounded-[10px] transition-all ${
            active === t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <p className="text-white font-semibold mb-1">{title}</p>
      <p className="text-slate-500 text-sm max-w-xs">{desc}</p>
    </div>
  );
}

// ─── Code Block ───────────────────────────────────────────────────────────────
export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group rounded-[10px] bg-black/40 border border-white/8 p-4 font-mono text-sm text-emerald-300 overflow-x-auto">
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-3 right-3 px-2 py-1 text-xs bg-white/5 text-slate-400 rounded-[10px] border border-white/10 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre className="whitespace-pre-wrap break-all">{code}</pre>
    </div>
  );
}
