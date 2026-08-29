'use client';

import Link from 'next/link';

import { OndiBrand, BrandWatermark } from './OneUI';

import {
  ShieldCheck,
  Globe,
  Mail,
  MapPin,
} from 'lucide-react';

// ─── Social icons via simple SVG paths ────────────────────────────────────────
function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

const NAV_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'For Individuals', href: '/personal' },
      { label: 'For Organizations', href: '/business' },
      { label: 'Developer Platform', href: '/platform' },
      { label: 'Security', href: '/security' },
      { label: 'API Reference', href: '/developers' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { label: 'Identity & KYC', href: '/personal' },
      { label: 'Workforce Identity', href: '/business' },
      { label: 'Trust Score Engine', href: '/personal' },
      { label: 'SSO & Access Control', href: '/platform' },
      { label: 'Compliance Suite', href: '/platform' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/developers' },
      { label: 'Trust Standards', href: '/security' },
      { label: 'API Status', href: '#' },
      { label: 'Changelog', href: '#' },
      { label: 'Blog', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Ondi', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Press Kit', href: '#' },
      { label: 'Contact Sales', href: '#' },
      { label: 'Support', href: '#' },
    ],
  },
];

const TRUST_BADGES = [
  { label: 'NIDA Integrated', icon: ShieldCheck },
  { label: 'W3C Compliant', icon: Globe },
  { label: 'ISO 27001 Aligned', icon: ShieldCheck },
  { label: 'GDPR Ready', icon: ShieldCheck },
];

const SOCIALS = [
  { label: 'X (Twitter)', href: '#', Icon: XIcon },
  { label: 'LinkedIn', href: '#', Icon: LinkedInIcon },
];

const CURRENT_YEAR = new Date().getFullYear();

export default function MainFooter() {
  const currentYear = CURRENT_YEAR;

  return (
    <footer
      className="relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #001633 0%, #00102A 100%)' }}
      aria-label="Site footer"
    >
      {/* Subtle brand watermark — low opacity, right-anchored */}
      <BrandWatermark
        opacity={0.04}
        size="600px"
        color="#4253D1"
        className="absolute -right-24 -bottom-24 pointer-events-none"
      />



      {/* ── Main Footer Body ────────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-12 space-y-16">

        {/* Brand + Nav Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_repeat(4,1fr)] gap-12 lg:gap-8">

          {/* Brand Column */}
          <div className="space-y-8 lg:pr-8">
            <OndiBrand size={20} theme="dark" />
            <p className="text-sm text-white/45 leading-relaxed font-normal max-w-xs">
              The unified digital trust infrastructure for East Africa — powering verified identities, sovereign credentials, and frictionless access.
            </p>

            {/* Contact Snippet */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-white/40 font-mono">
                <MapPin size={12} className="shrink-0 text-[#4253D1]" />
                <span>Dar es Salaam, Tanzania</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/40 font-mono">
                <Mail size={12} className="shrink-0 text-[#4253D1]" />
                <span>hello@ondi.africa</span>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex items-center gap-3">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  suppressHydrationWarning
                  className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {/* Nav Columns */}
          {NAV_COLUMNS.map((col) => (
            <FooterColumn key={col.title} title={col.title} links={col.links} />
          ))}
        </div>

        {/* Trust Badge Row */}
        <div className="flex flex-wrap items-center gap-3 py-6 border-y border-white/[0.07]">
          <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest font-mono mr-2">
            Compliance &amp; Standards
          </span>
          {TRUST_BADGES.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] font-bold text-white/40 uppercase tracking-wider font-mono"
            >
              <Icon size={10} className="text-[#4253D1] shrink-0" />
              {label}
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Copyright */}
          <div className="text-[11px] font-mono text-white/30 uppercase tracking-wider" suppressHydrationWarning>
            © {currentYear} Ondi — Hudumika Group
          </div>

          {/* Legal Links */}
          <div className="flex items-center gap-6 text-[11px] font-mono text-white/30 uppercase tracking-wider">
            <a href="#" suppressHydrationWarning className="hover:text-white/60 transition-colors whitespace-nowrap">Privacy Policy</a>
            <span className="text-white/10">·</span>
            <a href="#" suppressHydrationWarning className="hover:text-white/60 transition-colors whitespace-nowrap">Terms of Service</a>
            <span className="text-white/10">·</span>
            <a href="#" suppressHydrationWarning className="hover:text-white/60 transition-colors whitespace-nowrap">Cookie Preferences</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Footer Column ─────────────────────────────────────────────────────────────
function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div className="space-y-6">
      <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] font-mono">
        {title}
      </h4>
      <ul className="space-y-3.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              suppressHydrationWarning
              className="text-[13px] font-medium text-white/55 hover:text-white transition-colors duration-150 block leading-none"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
