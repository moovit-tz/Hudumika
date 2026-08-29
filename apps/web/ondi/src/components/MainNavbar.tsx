'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { OndiBrand } from './OneUI';
import {
  Shield, Users, UserCheck, Key, Lock, Laptop, ShieldAlert,
  Award, Building2, Scale, Network, Coins, Activity,
  ShoppingBag, Truck, Globe, Heart,
  BookOpen, ShieldCheck, HelpCircle, FileText, Mail, Compass,
  Briefcase, Menu, X, ChevronDown, ArrowRight,
  ClipboardCheck, FileLock2, Fingerprint
} from 'lucide-react';

type TabType = 'products' | 'solutions' | 'learning' | 'company';

interface MegaLink {
  icon: React.ElementType;
  title: string;
  desc: string;
  href: string;
}

interface MegaSection {
  id: string;
  icon: React.ElementType;
  label: string;
  headline: string;
  desc: string;
  links: MegaLink[];
}

interface MegaTabData {
  sections: MegaSection[];
  featured: { title: string; desc: string; cta: string; href: string };
  bottomStrip?: { href: string; label: string; badges: string[] };
}

const MEGA: Record<TabType, MegaTabData> = {
  products: {
    sections: [
      {
        id: 'identity-platform',
        icon: Shield,
        label: 'Identity Platform',
        headline: 'Every identity, one platform',
        desc: 'Workforce, customer, and personal identity — verified against East Africa\'s authoritative registries.',
        links: [
          {
            icon: Users,
            title: 'Workforce Identity',
            desc: 'Automated JML lifecycle, secure employee access, and contractor verification backed by BRELA and NIDA.',
            href: '/business',
          },
          {
            icon: UserCheck,
            title: 'Customer Identity',
            desc: 'Instant customer onboarding by bridging NIDA, BRELA, and TRA — reduce drop-off with registry-verified KYC.',
            href: '/products/customer-identity',
          },
          {
            icon: Fingerprint,
            title: 'Personal Identity',
            desc: 'Encrypted sovereign credential wallets — owned by the individual, reusable across every connected service.',
            href: '/personal',
          },
          {
            icon: Building2,
            title: 'Universal Directory',
            desc: 'A unified, authoritative catalog of organizations, teams, and roles — synced from live registry data.',
            href: '/products/directory',
          },
        ],
      },
      {
        id: 'auth-security',
        icon: Key,
        label: 'Authentication & Security',
        headline: 'Zero Trust access for every session',
        desc: 'Adaptive MFA, passwordless SSO, and device trust that scales from 10 to 100,000 users.',
        links: [
          {
            icon: Key,
            title: 'Single Sign-On',
            desc: 'Passwordless SSO across every connected business tool — no friction, no password reuse risk.',
            href: '/products/sso',
          },
          {
            icon: Lock,
            title: 'Adaptive MFA',
            desc: 'Context-aware step-up authentication with biometric liveness checks and risk scoring.',
            href: '/products/mfa',
          },
          {
            icon: Laptop,
            title: 'Device Trust',
            desc: 'Bind, recognize, and enforce security policies on every trusted endpoint across your network.',
            href: '/products/device-trust',
          },
          {
            icon: ShieldAlert,
            title: 'Threat Protection',
            desc: 'Real-time detection and automated blocking of credential stuffing, ATO, and anomalous access patterns.',
            href: '/products/threat-protection',
          },
        ],
      },
      {
        id: 'trust-compliance',
        icon: FileLock2,
        label: 'Trust & Compliance',
        headline: 'Compliance built in, not bolted on',
        desc: 'PDPA tooling, trust scoring, and governance controls — all in one audit-ready layer.',
        links: [
          { icon: FileLock2, title: 'PDPA Compliance Suite', desc: 'Automated compliance, consent management, and a live DPO workspace.', href: '/products/pdpa' },
          { icon: ClipboardCheck, title: 'Data Mapping & Inventory', desc: 'Auto-discover and classify personal data flows across all connected systems.', href: '/products/pdpa#data-mapping' },
          { icon: ShieldCheck, title: 'Rights & Breach Portal', desc: 'End-to-end data-subject rights requests and breach notification tracking.', href: '/products/pdpa#rights-portal' },
          { icon: Award, title: 'Trust Score Engine', desc: 'Dynamic reputational scoring that maps risk factors across identity signals.', href: '/products/trust-score' },
          { icon: Scale, title: 'Identity Governance', desc: 'Access reviews, role-based controls, and permission audits in one place.', href: '/products/governance' },
          { icon: Network, title: 'Integration Network', desc: 'SCIM 2.0 provisioning for your workforce app stack, with government-registry integrations available via partnership.', href: '/products/integrations' },
        ],
      },
    ],
    featured: {
      title: 'Ondi Platform Overview',
      desc: 'One infrastructure layer for workforce, customer, and personal identity — built on East Africa\'s authoritative registries.',
      cta: 'Explore the Platform',
      href: '/business',
    },
    bottomStrip: { href: '/business', label: 'Explore the full Ondi platform', badges: ['NIDA', 'BRELA', 'TRA', 'W3C', 'ISO 27001'] },
  },

  solutions: {
    sections: [
      {
        id: 'by-scope',
        icon: Users,
        label: 'By Organization',
        headline: 'Right-sized for every organization',
        desc: 'Whether you\'re an individual, a growing SME, or a large enterprise — Ondi scales with you.',
        links: [
          {
            icon: Building2,
            title: 'Enterprise',
            desc: 'Multi-tenant identity infrastructure for large organizations with complex workforce and compliance needs.',
            href: '/solutions/enterprise',
          },
          {
            icon: Briefcase,
            title: 'Business & SME',
            desc: 'Right-sized identity tools for growing teams — onboard customers and staff in days, not months.',
            href: '/solutions/business',
          },
          {
            icon: Shield,
            title: 'Individual',
            desc: 'Your sovereign identity wallet — verified credentials you own and share entirely on your own terms.',
            href: '/solutions/individual',
          },
        ],
      },
      {
        id: 'by-industry',
        icon: Building2,
        label: 'By Industry',
        headline: 'Built for your sector',
        desc: 'Purpose-built identity and compliance solutions for the unique needs of each East African industry.',
        links: [
          { icon: Coins, title: 'Financial Services', desc: 'KYC, AML, and digital onboarding for fintechs, banks, and SACCOs.', href: '/solutions/finance' },
          { icon: Building2, title: 'Public Sector', desc: 'Citizen identity, registry integration, and compliant e-Government portals.', href: '/solutions/public-sector' },
          { icon: Activity, title: 'Healthcare', desc: 'Verified doctor registries, patient portals, and clinical access control.', href: '/solutions/healthcare' },
          { icon: ShoppingBag, title: 'Retail & Commerce', desc: 'Fraud-free checkouts, verified merchants, and loyalty identity.', href: '/solutions/retail' },
          { icon: Truck, title: 'Logistics & Mobility', desc: 'Real-time courier verification and vetted driver identity at scale.', href: '/solutions/logistics' },
          { icon: Globe, title: 'Technology Platforms', desc: 'Developer APIs and identity primitives for SaaS and marketplace apps.', href: '/developers' },
          { icon: Heart, title: 'Non-Profit & NGOs', desc: 'Secure aid distribution, beneficiary verification, and donor trust.', href: '/solutions/non-profit' },
        ],
      },
      {
        id: 'privacy-compliance',
        icon: FileLock2,
        label: 'Privacy & Compliance',
        headline: 'PDPA compliance, end to end',
        desc: 'Meet East Africa\'s Personal Data Protection Act with automated tooling and a live compliance maturity dashboard.',
        links: [
          {
            icon: FileLock2,
            title: 'PDPA Compliance',
            desc: 'Full-cycle compliance automation with a live maturity dashboard and built-in DPO workspace.',
            href: '/products/pdpa',
          },
          {
            icon: ClipboardCheck,
            title: 'Consent Management',
            desc: 'Granular, auditable consent capture and a data-subject rights portal built into every flow.',
            href: '/products/pdpa#consent',
          },
          {
            icon: ShieldCheck,
            title: 'Breach Management',
            desc: 'Incident response workflows and mandatory breach notification tracking with regulator-ready reports.',
            href: '/products/pdpa#rights-portal',
          },
        ],
      },
    ],
    featured: {
      title: 'Take the Trust Assessment',
      desc: 'Get a live view of your organization\'s identity security posture and receive a personalized deployment roadmap. Free — 5 minutes.',
      cta: 'Start Assessment',
      href: '/assessment',
    },
    bottomStrip: { href: '/assessment', label: 'Free Trust Assessment — see your identity security score in 5 minutes', badges: ['Tanzania', 'Kenya', 'Uganda', 'Rwanda'] },
  },

  learning: {
    sections: [
      {
        id: 'resources',
        icon: BookOpen,
        label: 'Resource Library',
        headline: 'Guides, research & insights',
        desc: 'Whitepapers, implementation guides, and trust technology insights to level up your team.',
        links: [
          { icon: BookOpen, title: 'Resource Center', desc: 'Guides, whitepapers, and trust technology insights.', href: '/resources' },
          { icon: Users, title: 'Customer Stories', desc: 'How East African innovators leverage Ondi.', href: '/case-studies' },
          { icon: ShieldCheck, title: 'Security & Trust Center', desc: 'Compliance policies, uptime, and encryption standards.', href: '/security' },
        ],
      },
      {
        id: 'support',
        icon: HelpCircle,
        label: 'Get Support',
        headline: 'We\'re here when you need us',
        desc: 'Technical support, detailed API docs, and direct access to our solutions team.',
        links: [
          { icon: HelpCircle, title: 'Get Support', desc: 'Submit technical tickets and configure workspace integrations.', href: '/support' },
          { icon: FileText, title: 'Help Center & Docs', desc: 'Detailed API schemas, credentials integration, and FAQs.', href: '/docs' },
          { icon: Mail, title: 'Contact Solutions Sales', desc: 'Schedule a consultative deployment architecture session.', href: '/contact' },
        ],
      },
    ],
    featured: { title: 'Security & Trust Center', desc: 'We cryptographically safeguard consent histories and lock biometric vectors using hardware KMS.', cta: 'Read Commitment', href: '/security' },
  },

  company: {
    sections: [
      {
        id: 'about',
        icon: Shield,
        label: 'About',
        headline: 'Building East Africa\'s digital trust layer',
        desc: 'Ondi is the portable reputation capital platform for the continent\'s leading enterprises.',
        links: [
          { icon: Shield, title: 'About Ondi', desc: 'Building the portable reputation capital of East Africa.', href: '/about' },
          { icon: Users, title: 'Our Customers', desc: 'Meet the companies accelerating digital inclusion.', href: '/case-studies' },
        ],
      },
      {
        id: 'responsibility',
        icon: Scale,
        label: 'Trust & Responsibility',
        headline: 'Identity should empower, not expose',
        desc: 'Our commitments to user privacy, data sovereignty, and explicit consent throughout every product.',
        links: [
          { icon: Scale, title: 'Responsible Identity', desc: 'Our commitment to user privacy, data sovereignty, and explicit consent.', href: '/company/responsible-identity' },
          { icon: Compass, title: 'Social Impact', desc: 'Improving digital inclusion, financial access, and security.', href: '/company/social-impact' },
        ],
      },
      {
        id: 'ecosystem',
        icon: Network,
        label: 'Ecosystem',
        headline: 'Join our partner network',
        desc: 'Integrate verified credentials with our alliance registry nodes and grow together.',
        links: [
          { icon: Network, title: 'Ecosystem Partners', desc: 'Integrate verified credentials with our alliance registry nodes.', href: '/company/partners' },
          { icon: Briefcase, title: 'Careers', desc: 'Join us in shaping the foundation of trusted infrastructure.', href: '/company/careers' },
        ],
      },
    ],
    featured: { title: 'Trust & Responsibility', desc: 'We believe digital identity must be user-owned, transparently governed, and secure by default.', cta: 'Read Values', href: '/about' },
  },
};

export default function MainNavbar() {
  const router = useRouter();
  const pathname = usePathname();

  const [isScrolled, setIsScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileActiveSub, setMobileActiveSub] = useState<TabType | null>(null);

  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close on route change
  useEffect(() => {
    setActiveTab(null);
    setMobileMenuOpen(false);
    setMobileActiveSub(null);
  }, [pathname]);

  // Close on click outside
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveTab(null);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveTab(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Click to toggle tab (open / close)
  const handleTabClick = (tab: TabType) => {
    setActiveTab(activeTab === tab ? null : tab);
  };

  const handleMobileTabToggle = (tab: TabType) => {
    setMobileActiveSub(mobileActiveSub === tab ? null : tab);
  };

  const currentTabData = activeTab ? MEGA[activeTab] : null;
  const isMenuCompact = currentTabData ? currentTabData.sections.length >= 4 : false;

  return (
    <nav className={`fixed w-full top-0 z-[100] transition-all duration-500 px-5 lg:px-8 ${isScrolled ? 'py-3' : 'py-5'} pointer-events-none`}>
      <motion.div
        ref={navRef}
        initial={{ y: -32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`max-w-7xl mx-auto flex items-center justify-between px-5 lg:px-7 py-2.5 rounded-full border transition-all duration-500 pointer-events-auto relative ${isScrolled
          ? 'bg-white/97 backdrop-blur-2xl border-slate-200/80 shadow-[0_8px_32px_-8px_rgba(0,22,51,0.18),0_2px_8px_-2px_rgba(0,22,51,0.08)]'
          : 'bg-white/90 backdrop-blur-xl border-slate-200/50 shadow-[0_4px_24px_-8px_rgba(0,22,51,0.12),0_1px_4px_-1px_rgba(0,22,51,0.06)]'
          }`}
      >
        {/* LEFT: LOGO + DESKTOP NAV */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group shrink-0" suppressHydrationWarning>
            <OndiBrand size={30} theme="light" className="group-hover:scale-105 transition-all duration-500" />
          </Link>

          <div className="hidden lg:flex items-center gap-0.5">
            {([
              { id: 'products', label: 'Products' },
              { id: 'solutions', label: 'Solutions' },
              { id: 'learning', label: 'Learning & Support' },
              { id: 'company', label: 'Company' },
            ] as { id: TabType; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-semibold tracking-wide transition-all duration-200 ${activeTab === tab.id
                  ? 'text-[#4253D1] bg-[#ECEEFF]'
                  : 'text-slate-500 hover:text-[#001633] hover:bg-slate-100/70'
                  }`}
              >
                <span>{tab.label}</span>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-300 ${activeTab === tab.id ? 'rotate-180 text-[#4253D1]' : 'text-slate-400'}`}
                />
                {/* Active indicator dot */}
                {activeTab === tab.id && (
                  <motion.span
                    layoutId="nav-active-dot"
                    className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#4253D1]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: ACTIONS */}
        <div className="flex items-center gap-4">
          <Link href="/login" suppressHydrationWarning className="hidden sm:block text-[13px] font-semibold tracking-wide text-slate-500 hover:text-[#001633] transition-colors px-3 py-2">
            Log In
          </Link>
          <button
            onClick={() => router.push('/assessment')}
            className="hidden lg:flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#001633] to-[#1a2d4a] text-white text-[12.5px] font-bold tracking-wider rounded-full hover:from-[#4253D1] hover:to-[#001633] transition-all duration-300 active:scale-95 shadow-lg shadow-slate-900/20 whitespace-nowrap"
          >
            Get Started
            <ArrowRight size={13} className="ml-0.5" />
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2.5 rounded-full hover:bg-slate-100 transition-colors text-slate-600 hover:text-[#001633]"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* ── DESKTOP MEGA MENU ─────────────────────────────────────────── */}
        <AnimatePresence>
          {activeTab && currentTabData && (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-0 right-0 top-full mt-3 bg-white border border-slate-200/60 rounded-[1.5rem] overflow-hidden z-[100] pointer-events-auto"
              style={{ boxShadow: '0 20px 60px rgba(0,22,51,0.13), 0 4px 16px rgba(0,22,51,0.06)' }}
            >
              <div className="flex" style={{ minHeight: 248 }}>

                {/* SECTIONS GRID */}
                <div
                  className="flex-1 p-6 grid"
                  style={{
                    gridTemplateColumns: `repeat(${currentTabData.sections.length}, 1fr)`,
                    gap: isMenuCompact ? '0.75rem' : '1.25rem',
                  }}
                >
                  {currentTabData.sections.map((section) => {
                    const sectionCompact = isMenuCompact || section.links.length >= 5;
                    return (
                      <div key={section.id} className="flex flex-col min-w-0">

                        {/* Section label chip */}
                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                          <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-[#EEF0FF]">
                            <section.icon size={10} className="text-[#4253D1]" />
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.14em] leading-none">
                            {section.label}
                          </span>
                        </div>

                        {/* Links */}
                        <div className={sectionCompact && section.links.length >= 5 ? 'grid grid-cols-2 gap-x-0.5 gap-y-0' : 'flex flex-col gap-0'}>
                          {section.links.map((link) => (
                            <MegaMenuLink
                              key={link.href}
                              icon={link.icon}
                              title={link.title}
                              desc={link.desc}
                              href={link.href}
                              compact={sectionCompact}
                            />
                          ))}
                        </div>

                      </div>
                    );
                  })}
                </div>

                {/* FEATURED CARD */}
                <div className="w-72 shrink-0 border-l border-slate-100 p-4 flex flex-col">
                  <FeaturedCard
                    title={currentTabData.featured.title}
                    desc={currentTabData.featured.desc}
                    cta={currentTabData.featured.cta}
                    href={currentTabData.featured.href}
                  />
                </div>

              </div>

              {/* BOTTOM STRIP */}
              {currentTabData.bottomStrip && (
                <Link
                  href={currentTabData.bottomStrip.href}
                  className="group flex items-center justify-between gap-4 px-6 py-3 border-t border-slate-100 bg-slate-50 hover:bg-[#ECEEFF] transition-colors duration-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-[#4253D1] group-hover:bg-[#001633] flex items-center justify-center shrink-0 transition-colors">
                      <ShieldCheck size={11} className="text-white" />
                    </div>
                    <span className="text-[11.5px] font-semibold text-[#001633] leading-snug">
                      {currentTabData.bottomStrip.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {currentTabData.bottomStrip.badges.map((badge) => (
                      <span key={badge} className="hidden sm:block text-[9.5px] font-bold uppercase tracking-widest font-mono text-slate-400 group-hover:text-[#4253D1] transition-colors">
                        {badge}
                      </span>
                    ))}
                    <ArrowRight size={13} className="text-[#4253D1] group-hover:translate-x-1 transition-transform duration-200" />
                  </div>
                </Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── MOBILE DRAWER ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-x-0 top-0 bottom-0 bg-white/98 backdrop-blur-2xl z-[90] pt-28 pb-10 px-8 flex flex-col justify-between overflow-y-auto pointer-events-auto border-b border-slate-100 shadow-2xl"
          >
            <div className="space-y-8 mt-4">
              {([
                { id: 'products', label: 'Products' },
                { id: 'solutions', label: 'Solutions' },
                { id: 'learning', label: 'Learning & Support' },
                { id: 'company', label: 'Company' },
              ] as { id: TabType; label: string }[]).map((tab) => {
                const isSubActive = mobileActiveSub === tab.id;
                return (
                  <div key={tab.id} className="space-y-4">
                    <button
                      onClick={() => handleMobileTabToggle(tab.id)}
                      className={`w-full flex items-center justify-between text-lg font-bold text-left tracking-wide transition-colors ${isSubActive ? 'text-[#4253D1]' : 'text-[#001633]'}`}
                    >
                      <span>{tab.label}</span>
                      <ChevronDown size={18} className={`transition-transform duration-300 ${isSubActive ? 'rotate-180 text-[#4253D1]' : 'text-slate-400'}`} />
                    </button>

                    <AnimatePresence>
                      {isSubActive && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l border-slate-100 overflow-hidden"
                        >
                          <div className="space-y-4 py-1">
                            {MEGA[tab.id].sections.flatMap(s => s.links).map(link => (
                              <Link
                                key={link.href}
                                href={link.href}
                                className="block text-[14.5px] font-medium text-slate-500 hover:text-[#4253D1] transition-colors py-0.5"
                              >
                                {link.title}
                              </Link>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-100">
              <Link href="/login" className="block text-center py-3.5 border border-slate-200 rounded-full font-bold text-[#001633] text-sm">
                Log In
              </Link>
              <button
                onClick={() => router.push('/assessment')}
                className="w-full text-center py-4 bg-[#001633] text-white rounded-full font-bold text-sm shadow-xl shadow-slate-200"
              >
                Get Started
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

// ── HELPER COMPONENTS ───────────────────────────────────────────────────

function MegaMenuLink({
  icon: Icon,
  title,
  desc,
  href,
  compact = false,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  href: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-2.5 rounded-xl px-2.5 py-2 hover:bg-[#EEF0FF] transition-colors duration-150"
    >
      {/* Icon tile — light blue bg always, fills solid Ondi blue on hover */}
      <div className="mt-[2px] w-7 h-7 rounded-lg bg-[#EEF0FF] border border-[#D8DBFF] group-hover:bg-[#4253D1] group-hover:border-[#4253D1] flex items-center justify-center shrink-0 transition-all duration-200">
        <Icon size={13} strokeWidth={1.9} className="text-[#4253D1] group-hover:text-white transition-colors duration-200" />
      </div>

      {/* Text — no truncation, wraps naturally */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1.5">
          <span className="text-[12.5px] font-semibold text-[#001633] group-hover:text-[#4253D1] transition-colors leading-snug">
            {title}
          </span>
          <ArrowRight
            size={10}
            className="mt-[3px] shrink-0 text-[#4253D1] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
          />
        </div>
        {!compact && (
          <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
            {desc}
          </p>
        )}
      </div>
    </Link>
  );
}

function FeaturedCard({ title, desc, cta, href }: { title: string; desc: string; cta: string; href: string }) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col flex-1 rounded-2xl overflow-hidden cursor-pointer"
      style={{ background: 'linear-gradient(145deg, #001633 0%, #061e45 60%, #0d2757 100%)' }}
    >
      {/* Dot-grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />
      {/* Top-right ambient glow */}
      <div
        className="absolute -top-8 -right-8 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(66,83,209,0.55) 0%, transparent 70%)' }}
      />
      {/* Bottom-left ambient glow */}
      <div
        className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)' }}
      />

      {/* Content stack */}
      <div className="relative z-10 flex flex-col flex-1 p-5 gap-4">

        {/* Icon badge */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center self-start shrink-0"
          style={{ background: 'rgba(66,83,209,0.22)', border: '1px solid rgba(66,83,209,0.45)' }}
        >
          <ShieldCheck size={20} className="text-[#8b9ef6]" />
        </div>

        {/* Body — grows to push CTA to bottom */}
        <div className="flex-1 flex flex-col gap-1.5">
          <span
            className="text-[9px] font-bold tracking-[0.2em] uppercase"
            style={{ color: '#8b9ef6' }}
          >
            Featured
          </span>
          <h4 className="text-[13.5px] font-bold text-white leading-snug">
            {title}
          </h4>
          <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: 'rgba(255,255,255,0.42)' }}>
            {desc}
          </p>
        </div>

        {/* CTA pinned to bottom */}
        <div
          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.11)',
          }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-wide transition-colors group-hover:text-white"
            style={{ color: 'rgba(255,255,255,0.72)' }}
          >
            {cta}
          </span>
          <ArrowRight
            size={12}
            className="group-hover:translate-x-0.5 transition-transform duration-150"
            style={{ color: 'rgba(255,255,255,0.38)' }}
          />
        </div>

      </div>
    </Link>
  );
}
