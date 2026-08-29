'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, GridBackground } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  FileText,
  Terminal,
  Code2,
  CheckCircle,
  Copy,
  BookOpen,
  Key,
  ShieldCheck,
  UserCheck,
  Server,
  Zap,
  ArrowRight
} from 'lucide-react';

const DOCS_SECTIONS = [
  {
    id: 'intro',
    title: 'API Introduction',
    desc: 'Core architecture overview, authentication standards, and FIDO2 passkey handshakes.'
  },
  {
    id: 'verify',
    title: 'NIDA Registry Query',
    desc: 'Verify legal names, birth dates, and document validity directly against authoritative NIDA nodes.'
  },
  {
    id: 'sso',
    title: 'SSO & OIDC Config',
    desc: 'Federate login across your custom portals, G-Suite, and corporate directories.'
  },
  {
    id: 'webhooks',
    title: 'Webhook Event Logs',
    desc: 'Subscribe to active identity milestones, biometric checks, and revocations logs.'
  }
];

const CODE_TEMPLATES: Record<string, Record<string, string>> = {
  intro: {
    curl: `curl -X POST https://api.ondi.africa/v1/auth/session \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "deviceAttestation": "FIDO2_TPM_SIGNATURE",
    "tenantId": "org_saccos_tz_7894"
  }'`,
    js: `import { Ondi } from '@ondi/sdk';

const ondi = new Ondi({ apiKey: 'YOUR_API_KEY' });

// Initialize biometric enclave request
const authSession = await ondi.auth.session({
  deviceAttestation: 'FIDO2_TPM_SIGNATURE',
  tenantId: 'org_saccos_tz_7894'
});`,
    python: `import ondi

client = ondi.Client(api_key="YOUR_API_KEY")

# Initialize secure hardware session
session = client.auth.create_session(
    device_attestation="FIDO2_TPM_SIGNATURE",
    tenant_id="org_saccos_tz_7894"
)`,
    go: `package main

import (
	"context"
	"github.com/ondi/sdk-go"
)

func main() {
	client := ondi.NewClient("YOUR_API_KEY")
	
	// Create secure TPM session
	session, err := client.Auth.CreateSession(context.Background(), ondi.SessionParams{
		DeviceAttestation: "FIDO2_TPM_SIGNATURE",
		TenantID:          "org_saccos_tz_7894",
	})
}`
  },
  verify: {
    curl: `curl -X POST https://api.ondi.africa/v1/verify/nida \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "nin": "19940815-XXXXX-XXXXX-XX",
    "requireLiveness": true,
    "attributes": ["fullName", "dateOfBirth", "nationality"]
  }'`,
    js: `import { Ondi } from '@ondi/sdk';

const ondi = new Ondi({ apiKey: 'YOUR_API_KEY' });

// Query authoritative NIDA registry with liveness challenge
const verification = await ondi.verify.nida({
  nin: '19940815-XXXXX-XXXXX-XX',
  requireLiveness: true,
  attributes: ['fullName', 'dateOfBirth', 'nationality']
});`,
    python: `import ondi

client = ondi.Client(api_key="YOUR_API_KEY")

# Verify legal NIDA citizen registry record
verification = client.verify.nida(
    nin="19940815-XXXXX-XXXXX-XX",
    require_liveness=True,
    attributes=["fullName", "dateOfBirth", "nationality"]
)`,
    go: `package main

import (
	"context"
	"github.com/ondi/sdk-go"
)

func main() {
	client := ondi.NewClient("YOUR_API_KEY")
	
	// Verify NIDA citizen attributes via node sync
	verification, err := client.Verify.Nida(context.Background(), ondi.NidaParams{
		NIN:             "19940815-XXXXX-XXXXX-XX",
		RequireLiveness: true,
		Attributes:      []string{"fullName", "dateOfBirth", "nationality"},
	})
}`
  },
  sso: {
    curl: `curl -X POST https://api.ondi.africa/v1/sso/oidc/client \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "clientName": "Corporate Employee Portal",
    "redirectUris": ["https://portal.company.co.tz/auth/callback"],
    "tokenSigningAlgorithm": "ES256"
  }'`,
    js: `import { Ondi } from '@ondi/sdk';

const ondi = new Ondi({ apiKey: 'YOUR_API_KEY' });

// Register new federated OIDC client dynamically
const client = await ondi.sso.createClient({
  clientName: 'Corporate Employee Portal',
  redirectUris: ['https://portal.company.co.tz/auth/callback'],
  tokenSigningAlgorithm: 'ES256'
});`,
    python: `import ondi

client = ondi.Client(api_key="YOUR_API_KEY")

# Create OIDC Client
oidc_client = client.sso.create_client(
    client_name="Corporate Employee Portal",
    redirect_uris=["https://portal.company.co.tz/auth/callback"],
    token_signing_algorithm="ES256"
)`,
    go: `package main

import (
	"context"
	"github.com/ondi/sdk-go"
)

func main() {
	client := ondi.NewClient("YOUR_API_KEY")
	
	// Provision dynamic OIDC client configurations
	oidcClient, err := client.SSO.CreateClient(context.Background(), ondi.OIDCParams{
		ClientName:            "Corporate Employee Portal",
		RedirectURIs:          []string{"https://portal.company.co.tz/auth/callback"},
		TokenSigningAlgorithm: "ES256",
	})
}`
  },
  webhooks: {
    curl: `curl -X POST https://api.ondi.africa/v1/webhooks/subscriptions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "endpointUrl": "https://api.company.co.tz/webhooks/ondi",
    "events": ["credential.verified", "consent.revoked"]
  }'`,
    js: `import { Ondi } from '@ondi/sdk';

const ondi = new Ondi({ apiKey: 'YOUR_API_KEY' });

// Subscribe to active identity events
const subscription = await ondi.webhooks.subscribe({
  endpointUrl: 'https://api.company.co.tz/webhooks/ondi',
  events: ['credential.verified', 'consent.revoked']
});`,
    python: `import ondi

client = ondi.Client(api_key="YOUR_API_KEY")

# Subscribe to identity lifecycle event hooks
subscription = client.webhooks.subscribe(
    endpoint_url="https://api.company.co.tz/webhooks/ondi",
    events=["credential.verified", "consent.revoked"]
)`,
    go: `package main

import (
	"context"
	"github.com/ondi/sdk-go"
)

func main() {
	client := ondi.NewClient("YOUR_API_KEY")
	
	// Subscribe webhook logs to live database triggers
	sub, err := client.Webhooks.Subscribe(context.Background(), ondi.WebhookParams{
		EndpointURL: "https://api.company.co.tz/webhooks/ondi",
		Events:      []string{"credential.verified", "consent.revoked"},
	})
}`
  }
};

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<string>('intro');
  const [activeLang, setActiveLang] = useState<string>('curl');
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    const code = CODE_TEMPLATES[activeSection]?.[activeLang] || '';
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#ECEEFF] selection:text-[#4253D1] overflow-x-hidden">
      <MainNavbar />

      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <section className="relative pt-56 pb-20 px-6 overflow-hidden bg-[#FAFAF8]">
        <BrandWatermark useImage={true} opacity={0.1} className="absolute inset-0 w-full h-full -z-30 pointer-events-none" />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(160deg,rgba(236,238,255,0.6)_0%,rgba(250,250,248,0)_70%)] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#4253D1]/5 blur-[140px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto relative z-10 text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#ECEEFF] border border-[#D5D9F5] text-[#4253D1]"
          >
            <Code2 size={13} className="animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">Developer Portal</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-5xl mx-auto font-sans"
          >
            Developer API &<br />
            <span className="text-[#4253D1]">Integration Guides.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-3xl mx-auto"
          >
            Implement passwordless biometric access, SCIM directory synchronization, and authoritative registry queries in minutes.
          </motion.p>
        </div>
      </section>

      {/* ── DOCS CORE INTERFACE ─────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white border-y border-slate-100 relative">
        <GridBackground />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-16 items-start">
            {/* Left Sidebar Guide Index Column */}
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-2 border-b border-slate-200/60 pb-3">
                <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono block">
                  Reference Manual
                </span>
                <h2 className="text-2xl font-bold text-[#001633] uppercase">Guides Directory</h2>
              </div>

              <div className="space-y-4">
                {DOCS_SECTIONS.map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSection(sec.id)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all flex gap-4 ${
                      activeSection === sec.id
                        ? 'bg-white border-[#4253D1] shadow-xl shadow-blue-900/5'
                        : 'bg-[#FAFAF8] border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      activeSection === sec.id ? 'bg-[#ECEEFF] text-[#4253D1]' : 'bg-white text-slate-400'
                    }`}>
                      <Terminal size={16} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-[#001633] uppercase leading-none">
                        {sec.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 leading-normal font-normal">
                        {sec.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Interactive Code sandbox Column */}
            <div className="lg:col-span-7">
              <ScrollReveal y={20} x={20}>
                <GlassPanel className="p-8 bg-[#001633] border-white/5 shadow-2xl rounded-[2rem] space-y-6 text-white min-h-[460px] flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Header bar with controls */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-4">
                      {/* Language Select tabs */}
                      <div className="flex gap-1.5 bg-white/5 p-1 rounded-full border border-white/10">
                        {['curl', 'js', 'python', 'go'].map((lang) => (
                          <button
                            key={lang}
                            onClick={() => setActiveLang(lang)}
                            className={`px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono transition-all ${
                              activeLang === lang
                                ? 'bg-white text-[#001633]'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {lang === 'js' ? 'NodeJS' : lang}
                          </button>
                        ))}
                      </div>

                      {/* Copy button */}
                      <button
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-full text-[9px] font-bold uppercase tracking-widest font-mono text-white transition-all"
                      >
                        {copied ? <CheckCircle size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                      </button>
                    </div>

                    {/* Active code view */}
                    <div className="overflow-x-auto py-2">
                      <pre className="font-mono text-xs text-blue-200/90 leading-relaxed text-left whitespace-pre">
                        <code>
                          {CODE_TEMPLATES[activeSection]?.[activeLang] || ''}
                        </code>
                      </pre>
                    </div>
                  </div>

                  {/* Footing Attestation */}
                  <div className="border-t border-white/10 pt-4 flex justify-between items-center text-[10px] text-white/30 font-mono">
                    <span>Host: api.ondi.africa</span>
                    <span>Version: v1.2.4</span>
                  </div>
                </GlassPanel>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── REGISTRY SPECIFICATION GRID ─────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#FAFAF8] relative overflow-hidden">
        <div className="max-w-6xl mx-auto space-y-16">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Dynamic Connectors</span>
              <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] uppercase leading-tight font-sans">Three Core API Capabilities</h2>
              <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
                Ondi simplifies advanced authentication flows into three robust REST categories.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: 'Passkey Handshakes', icon: Key, desc: 'Implement browser-native navigator.credentials WebAuthn APIs bound strictly to physical device Secure Enclaves.' },
              { title: 'Document Verification API', icon: Server, desc: 'OCR and MRZ checksum validation for passports and national ID documents, returned as structured JSON with a confidence score and match reasons.' },
              { title: 'SSO Federated Auth', icon: ShieldCheck, desc: 'Register clients, redirect tokens securely using dynamic OAuth 2.0 / SAML 2.0 standards, and manage sessions.' }
            ].map((node, i) => {
              const Icon = node.icon;
              return (
                <ScrollReveal key={node.title} y={24} delay={i * 0.1}>
                  <div className="p-8 bg-white border border-slate-100 rounded-3xl space-y-5 shadow-sm">
                    <div className="w-11 h-11 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center">
                      <Icon size={20} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base font-bold text-[#001633] uppercase tracking-tight">{node.title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed font-normal">{node.desc}</p>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA SECTION ────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-white text-center relative">
        <div className="max-w-3xl mx-auto space-y-10 relative z-10">
          <ScrollReveal y={16}>
            <div className="space-y-4">
              <h2 className="text-4xl lg:text-6xl font-bold text-[#001633] uppercase leading-tight font-sans">Start Integrating Now</h2>
              <p className="text-base text-slate-500 font-normal max-w-xl mx-auto leading-relaxed">
                Acquire sandbox API credentials instantly and begin prototyping.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal y={16} delay={0.1}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register/enterprise/kyb" className="w-full sm:w-auto relative overflow-hidden group px-12 py-5 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-mono shadow-2xl shadow-blue-500/20 flex items-center justify-center gap-2">
                <div className="absolute inset-0 w-full h-full -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                <span className="relative z-10">Register Developer Account</span>
                <ArrowRight size={16} className="relative z-10" />
              </Link>
              <Link href="/support" className="w-full sm:w-auto px-12 py-5 border border-[#D5D9F5] text-[#001633] rounded-full font-bold text-sm uppercase tracking-wider font-mono hover:bg-slate-50 transition-all flex items-center justify-center">
                Contact Technical Support
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
