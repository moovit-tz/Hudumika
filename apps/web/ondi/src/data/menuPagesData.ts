export interface MenuPageConfig {
  slug: string;
  title: string;
  category: string;
  iconName: string;
  tagline: string;
  description: string;
  detailedParagraphs: string[];
  benefits: {
    title: string;
    desc: string;
  }[];
  techSpecs: {
    label: string;
    value: string;
  }[];
  useCase: {
    organization: string;
    challenge: string;
    outcome: string;
  };
  stats: {
    label: string;
    value: string;
  }[];
}

export const PRODUCTS_DATA: Record<string, MenuPageConfig> = {
  sso: {
    slug: 'sso',
    title: 'Single Sign-On (SSO)',
    category: 'Authentication & Security',
    iconName: 'Key',
    tagline: 'Frictionless, passwordless federated access across all your enterprise tools.',
    description: 'Eliminate credentials and standard password vulnerabilities. Ondi SSO utilizes WebAuthn and secure hardware passkeys to authenticate users natively across SAML, OAuth 2.0, and OIDC portals.',
    detailedParagraphs: [
      'Passwords are the single largest attack vector in modern business. Ondi SSO replaces them completely with secure, device-bound public key cryptography. When a user logs in, they authorize via FaceID, TouchID, or a hardware security key, generating a unique cryptographic signature that verifies their identity instantly.',
      'Our SSO infrastructure aggregates all connected business applications (Google Workspace, Microsoft 365, SAP, custom internal nodes) into a beautiful, unified workspace console. Administrators can enforce strict, conditional access policies based on device compliance and threat levels.'
    ],
    benefits: [
      { title: 'Zero Password Friction', desc: 'Secure biometric authentication settles in under 200ms, completely removing login fatigue.' },
      { title: 'Unified Governance', desc: 'Manage access levels, revoke active sessions, and audit permissions from a single compliance console.' },
      { title: 'Standardized Protocols', desc: 'Natively supports SAML 2.0, OpenID Connect (OIDC), and OAuth 2.0 integrations.' }
    ],
    techSpecs: [
      { label: 'Protocols Supported', value: 'SAML 2.0, OIDC, OAuth 2.0, SCIM' },
      { label: 'Cryptography', value: 'ECC (Secp256r1) / RSA 2048' },
      { label: 'Token Duration', value: 'Configurable (Custom JWT expiry)' }
    ],
    useCase: {
      organization: 'Tanzania SACCOs Alliance',
      challenge: 'Branch workers managing 8+ distinct local portal credentials, leading to frequent lockouts and password reset overhead.',
      outcome: 'Consolidated all core loan and deposit applications into Ondi SSO, reducing support tickets by 94%.'
    },
    stats: [
      { label: 'Authentication Speed', value: '< 200ms' },
      { label: 'Credential Breaches', value: '0%' },
      { label: 'SLA Uptime Guarantee', value: '99.99%' }
    ]
  },
  mfa: {
    slug: 'mfa',
    title: 'Adaptive Multi-Factor Authentication',
    category: 'Authentication & Security',
    iconName: 'ShieldCheck',
    tagline: 'Context-aware, biometric liveness validation triggers on critical scopes.',
    description: 'Ensure that only the right person has access. Ondi Adaptive MFA evaluates risk-based markers (device status, geographical velocity, network signatures) to trigger biometric liveness challenges.',
    detailedParagraphs: [
      'Static MFA is no longer enough. Standard SMS and authenticator apps are vulnerable to SIM swapping and push fatigue attacks. Ondi introduces physical hardware binding combined with real-time biometric Face ID/Touch ID liveness validation.',
      'Our adaptive risk scoring engine continuously evaluates behavioral context during high-privilege activities (such as batch wire transfers or sensitive legal submissions), triggering seamless biometrics prompts only when risk thresholds are breached.'
    ],
    benefits: [
      { title: 'Phishing-Resistant MFA', desc: 'Device-bound WebAuthn tokens prevent remote interception and credential redirection.' },
      { title: 'Risk-Based Engine', desc: 'Smart algorithms automatically assess travel velocity, IP anomalies, and device parameters.' },
      { title: 'Swahili Voice Biometrics', desc: 'Built-in support for Swahili and English conversational verification prompts.' }
    ],
    techSpecs: [
      { label: 'Authentication Type', value: 'FIDO2 / WebAuthn, Biometric Liveness' },
      { label: 'Liveness Algorithm', value: '3D Passive Facial Depth Classification' },
      { label: 'Integration Method', value: 'REST API, iOS/Android SDKs' }
    ],
    useCase: {
      organization: 'E-Government Agency',
      challenge: 'Critical database access being compromised through remote credential theft and phishing.',
      outcome: 'Deployed Adaptive MFA bound to local device Secure Enclaves, blocking 100% of illegal remote session hijacking attempts.'
    },
    stats: [
      { label: 'Phishing Protection', value: '100%' },
      { label: 'Friction Rate', value: '< 2%' },
      { label: 'Liveness Accuracy', value: '99.999%' }
    ]
  },
  'device-trust': {
    slug: 'device-trust',
    title: 'Device Trust Infrastructure',
    category: 'Authentication & Security',
    iconName: 'Laptop',
    tagline: 'Recognize, bind, and secure trusted hardware nodes natively.',
    description: 'Establish cryptographic proof of hardware custody. Ondi binds user credentials directly to physical enclaves, blocking unauthorized access from unregistered devices.',
    detailedParagraphs: [
      'Security is not just about who is logging in, but also *where* they are logging in from. Ondi Device Trust binds your employees and users to specific, cryptographically registered hardware profiles.',
      'During registration, Ondi provisions a hardware-locked private key inside the local device\'s Trusted Platform Module (TPM) or Secure Enclave. Every authentication request validates that this unique hardware signature matches, preventing session hijacking.'
    ],
    benefits: [
      { title: 'Hardware Custody Lock', desc: 'Prevents credential sharing and access from personal, non-compliant, or external devices.' },
      { title: 'Automated Device Ban', desc: 'Administrators can instantly flag, quarantine, or revoke any specific device key remotely.' },
      { title: 'Zero Agent Overhead', desc: 'Works directly through browser-native WebAuthn APIs—no bulky local desktop software required.' }
    ],
    techSpecs: [
      { label: 'Hardware Bind Method', value: 'TPM 2.0 / Apple Secure Enclave' },
      { label: 'Protocol Support', value: 'Enterprise Attestation / FIDO2' },
      { label: 'Os Compatibility', value: 'macOS, iOS, Windows, Android, Linux' }
    ],
    useCase: {
      organization: 'East African Logistics Hub',
      challenge: 'Contractor staff logging into internal shipping dashboards using unsecured, personal home computers.',
      outcome: 'Bound all employee logins strictly to corporate laptops, blocking unauthorized remote dashboard traffic completely.'
    },
    stats: [
      { label: 'Device Binding Speed', value: '< 10s' },
      { label: 'Unregistered Access Blocked', value: '100%' },
      { label: 'Resource Overhead', value: '0%' }
    ]
  },
  'threat-protection': {
    slug: 'threat-protection',
    title: 'Identity Threat Protection',
    category: 'Authentication & Security',
    iconName: 'Lock',
    tagline: 'Detect, isolate, and block malicious credential activity in real time.',
    description: 'Continuous monitoring of credential behaviors. Ondi constantly scans access payloads for anomalous patterns, travel velocities, and malicious bot activities, blocking threats dynamically.',
    detailedParagraphs: [
      'Modern attacks happen in real time, which means static perimeter defense is no longer sufficient. Ondi Identity Threat Protection continuously analyzes session context even after a successful login.',
      'Our engine monitors session tokens for anomalous IP changes, impossible geographical travel speeds, and concurrent authentications. When a threat is detected, the session is either downgraded, prompted for biometrics, or terminated instantly.'
    ],
    benefits: [
      { title: 'Session Hijacking Block', desc: 'Instantly revokes session tokens if IP routing or device headers shift mid-session.' },
      { title: 'Credential Stuffing Def', desc: 'Automatic rate-limiting and progressive friction blocks automated bot attempts.' },
      { title: 'Real-Time Webhook Alert', desc: 'Dispatches instant payload alerts to corporate SIEM consoles for immediate quarantine.' }
    ],
    techSpecs: [
      { label: 'Detection Speed', value: 'Real-time (< 50ms)' },
      { label: 'Integrations', value: 'Splunk, Datadog, Custom Webhook nodes' },
      { label: 'Anomaly Model', value: 'Behavioral Pattern Velocity' }
    ],
    useCase: {
      organization: 'Digital Micro-Finance Network',
      challenge: 'Faced coordinate credential-stuffing attacks attempting to access high-profile customer accounts.',
      outcome: 'Deployed Ondi Threat Protection to block 45,000+ malicious bot request bursts, securing all customer capital.'
    },
    stats: [
      { label: 'Threat Reaction Time', value: '< 50ms' },
      { label: 'False Positive Rate', value: '< 0.1%' },
      { label: 'Secured Transactions', value: '50M+' }
    ]
  },
  'trust-score': {
    slug: 'trust-score',
    title: 'Trust Score Engine',
    category: 'Trust & Integrations',
    iconName: 'Award',
    tagline: 'Dynamic reputational scoring models mapping risk factors across 4 distinct categories.',
    description: 'Transform digital trust into verifiable capital. The Ondi Trust Score evaluates identity authenticity, financial behavior, and compliance standing to output a verified reputational score.',
    detailedParagraphs: [
      'Millions of reliable individuals in East Africa are locked out of credit and opportunities because manual vetting is too slow. Ondi aggregates behavioral consistency, identity validation, and registry history to compute a score (0–850).',
      'The score is user-owned and consent-gated, allowing individuals to share their verified trust score passport to banks, lenders, and partners to instantly unlock micro-credit or digital services.'
    ],
    benefits: [
      { title: 'Consent-Gated Sharing', desc: 'Users choose exactly when to disclose their score, keeping complete control of their data.' },
      { title: 'Authoritative Inputs', desc: 'Computed from official registries (TRA, NIDA) ensuring absolute reliability.' },
      { title: 'Dynamic Updating', desc: 'Scores adjust in real time as new compliance milestones or verifications settle.' }
    ],
    techSpecs: [
      { label: 'Score Scale', value: '0 – 850 (FICO standard aligned)' },
      { label: 'Category Weights', value: 'Identity 25%, Financial 35%, Behavioral 25%, Compliance 15%' },
      { label: 'Update Latency', value: 'Dynamic / Instant event-based' }
    ],
    useCase: {
      organization: 'Fintech Mobile Lender',
      challenge: 'High NPLs (Non-Performing Loans) due to lack of verified corporate history or director credentials.',
      outcome: 'Integrated the Ondi Trust Score API into their loan decisioning matrix, lowering NPLs by 42%.'
    },
    stats: [
      { label: 'Decision Latency', value: 'Instant' },
      { label: 'Credit Default Reduction', value: '42%' },
      { label: 'User Adoption', value: '280K+' }
    ]
  },
  directory: {
    slug: 'directory',
    title: 'Universal Directory',
    category: 'Trust & Integrations',
    iconName: 'Database',
    tagline: 'Unified organization cataloging and secure directory management.',
    description: 'Establish a single source of truth for your entire workforce. Ondi Universal Directory federates employee attributes, group mappings, and application permissions into a clean, searchable catalog.',
    detailedParagraphs: [
      'Managing employees, contractors, and access states across multiple disconnected databases breeds security gaps. Ondi Universal Directory aggregates all identities into an integrated, compliant database.',
      'Our directory supports deep, two-way synchronizations, allowing changes in HR software registries (such as newly hired or terminated employees) to reflect across all connected business applications instantly.'
    ],
    benefits: [
      { title: 'Dynamic Attribute Schema', desc: 'Supports custom organization metadata mapping, from local department codes to official TIN files.' },
      { title: 'Real-Time Sync Node', desc: 'Direct connectors keep HR software and IT catalogs in perfect, identical sync.' },
      { title: 'Granular Group Permissions', desc: 'Define access controls dynamically based on company role, seniority, or compliance profiles.' }
    ],
    techSpecs: [
      { label: 'Directory Standards', value: 'SCIM 2.0, LDAP, AD-Sync' },
      { label: 'Data Encryption', value: 'AES-256 at-rest / TLS 1.3 in-transit' },
      { label: 'Metadata Sizing', value: 'Unlimited custom fields' }
    ],
    useCase: {
      organization: 'National Utility Conglomerate',
      challenge: 'Manual entry and updates of 1,200+ employees across 14 separate local database silos, creating high data drift and lag.',
      outcome: 'Consolidated into Ondi Universal Directory, establishing a single real-time workforce directory for all regional offices.'
    },
    stats: [
      { label: 'Sync Latency', value: '< 2s' },
      { label: 'Data Consistency', value: '100%' },
      { label: 'Admin Hours Saved', value: '120h/month' }
    ]
  },
  governance: {
    slug: 'governance',
    title: 'Identity Governance',
    category: 'Trust & Integrations',
    iconName: 'Scale',
    tagline: 'Control permissions, audits, and role-based structures automatically.',
    description: 'Enforce regulatory compliance and prevent scope creep. Ondi Identity Governance automates access reviews, role-based controls (RBAC), and detailed audit logs.',
    detailedParagraphs: [
      'Access reviews should not be a manual spreadsheets nightmare. Ondi automates the governance lifecycle, helping you track exactly who has access to which resources, why they have it, and when that access should expire.',
      'Our platform generates comprehensive, auditor-ready compliance reports detailing every access request, approval chain, and policy override, fully signed using secure biometric signatures.'
    ],
    benefits: [
      { title: 'Automated Access Reviews', desc: 'Triggers periodic evaluations of critical scopes, revoking permissions automatically if neglected.' },
      { title: 'Role-Based Automations', desc: 'Assigns and revokes permissions based on departments, avoiding manual ticket overhead.' },
      { title: 'Auditor-Ready Reports', desc: 'Download comprehensive audit logs tracking every permission change.' }
    ],
    techSpecs: [
      { label: 'Control Method', value: 'RBAC (Role) & ABAC (Attribute) Control' },
      { label: 'Audit Trail Signature', value: 'Signed using SHA-256 and User Key' },
      { label: 'Compliance Standards', value: 'ISO 27001, GDPR, local PDPA Act' }
    ],
    useCase: {
      organization: 'Private Healthcare Hospital Network',
      challenge: 'Struggling to secure patient medical portals during audit reviews due to orphaned ex-employee accounts still having active access.',
      outcome: 'Implemented dynamic governance lifecycle triggers, revoking all ex-employee access immediately on contract termination.'
    },
    stats: [
      { label: 'Access Audit Speed', value: 'Instant' },
      { label: 'Orphaned Accounts', value: '0%' },
      { label: 'Audit Compliance Rate', value: '100%' }
    ]
  },
  integrations: {
    slug: 'integrations',
    title: 'Integration Network',
    category: 'Trust & Integrations',
    iconName: 'Zap',
    tagline: 'SCIM-based workforce provisioning, with government-registry integration available via partnership.',
    description: 'Unify your business ecosystem. Ondi provisions and deprovisions workforce accounts via SCIM 2.0 — the same standard Slack, Zoom, GitHub, and Workday already support — and OCR/MRZ-based document verification stands in for a direct government registry API today, since no East African national ID authority currently exposes one to third-party integrators.',
    detailedParagraphs: [
      'Authentic trust cannot exist in isolation. Ondi\'s SCIM integration keeps your connected apps in sync as people join, move, and leave — the same protocol, not a bespoke connector per vendor.',
      'Document-based KYC (OCR + MRZ checksum validation) is how Ondi verifies identity today; a live government registry API is a partnership question, not something any vendor in this space can claim as "live" without one existing to connect to.'
    ],
    benefits: [
      { title: 'SCIM 2.0 Provisioning', desc: 'Real onboarding/offboarding sync to any SCIM-compatible app — Slack, Zoom, GitHub, Workday, and more.' },
      { title: 'Document-Based KYC', desc: 'OCR + MRZ checksum validation for passports; structural verification for national ID and driver\'s license.' },
      { title: 'Custom REST SDKs', desc: 'Integrate custom database systems or local financial portals against Ondi\'s own API.' }
    ],
    techSpecs: [
      { label: 'Integration Protocols', value: 'REST API, Webhook endpoints, OAuth 2.0' },
      { label: 'Data Encryption', value: 'TLS 1.3 / Cryptographic API Payload signing' },
      { label: 'Registry Sync Speed', value: '< 800ms' }
    ],
    useCase: {
      organization: 'Regional E-Commerce Platform',
      challenge: 'Manual verification of merchant TINs and business incorporation certificates taking up to 3 weeks per vendor.',
      outcome: 'Connected Ondi Integration Network to automatically check TRA and BRELA databases, onboarding merchants in under 3 minutes.'
    },
    stats: [
      { label: 'Onboarding Time', value: '< 3m' },
      { label: 'Partner SDKs', value: '12+' },
      { label: 'API Uptime', value: '99.9%' }
    ]
  }
};

export const SOLUTIONS_DATA: Record<string, MenuPageConfig> = {
  workforce: {
    slug: 'workforce',
    title: 'Workforce Solutions',
    category: 'Identity Type',
    iconName: 'Users',
    tagline: 'Secure employee login, audits, and automated lifecycle governance.',
    description: 'Establish absolute security for your internal staff. Protect organizational resources by eliminating password vulnerabilities and managing the full workforce lifecycle.',
    detailedParagraphs: [
      'Securing a modern distributed workforce requires an uncompromising zero-trust approach. Ondi Workforce Solutions binds your employee identity to compliant hardware, eliminating passwords and securing access using FaceID/TouchID.',
      'Our JML (Joiner, Mover, Leaver) automation engine synchronizes with your HR software, automatically provisioning application permissions on day one, updating scopes on transfer, and revoking all workspace access immediately upon termination.'
    ],
    benefits: [
      { title: 'Passwordless Workforce', desc: 'Eliminate corporate phishing attacks by deploying FIDO2 hardware passkeys.' },
      { title: 'Instant Provisioning', desc: 'Automatically configure G-Suite, Slack, and internal database scopes for new hires.' },
      { title: 'Security Audit Logs', desc: 'Detailed, immutable logs mapping every staff login and system modification.' }
    ],
    techSpecs: [
      { label: 'Standards Met', value: 'FIDO2, WebAuthn, SCIM 2.0' },
      { label: 'Authentication Speed', value: '< 200ms' },
      { label: 'Admin Control API', value: 'REST / GraphQL' }
    ],
    useCase: {
      organization: 'Pan-African Telecommunications Firm',
      challenge: 'Faced recurrent data breaches due to ex-contractors still having active access to customer databases.',
      outcome: 'Implemented Ondi Workforce, revoking access automatically upon contractor contract expiration, fully securing user databases.'
    },
    stats: [
      { label: 'Security Breaches', value: '0%' },
      { label: 'Provisioning Speed', value: 'Instant' },
      { label: 'Audit Time Saved', value: '85%' }
    ]
  },
  customer: {
    slug: 'customer',
    title: 'Customer Solutions',
    category: 'Identity Type',
    iconName: 'UserCheck',
    tagline: 'Frictionless, compliant customer onboarding and KYC integration.',
    description: 'Verify your digital customers in under 3 minutes. Connect onboarding forms to authoritative national registries to instantly eliminate identity fraud and reduce friction.',
    detailedParagraphs: [
      'Customer onboarding is a critical battleground. Most users abandon digital applications if the registration process requires manual uploads, paper vetting, and days of validation delay.',
      'Ondi Customer Solutions integrates authoritative NIDA, TRA, and mobile biometric verification into your customer registration forms. Verify names, document validity, and liveness instantly without manual operations.'
    ],
    benefits: [
      { title: 'Registry KYC Binding', desc: 'Directly verify legal citizen records in under 3 minutes.' },
      { title: 'Biometric Liveness Check', desc: 'Ensure the applicant is a real person using advanced passive facial depth algorithms.' },
      { title: 'Fraud Mitigation', desc: 'Instantly catch forged credentials and synthetic identity attempts.' }
    ],
    techSpecs: [
      { label: 'KYC Checks Supported', value: 'NIDA Verification, Liveness Analysis' },
      { label: 'Integrations', value: 'iOS, Android, Web SDKs' },
      { label: 'Registry Connect Latency', value: '< 800ms' }
    ],
    useCase: {
      organization: 'Commercial Fintech Mobile App',
      challenge: 'Customer registration drop-off rate of 58% due to manual paperwork and slow manual verification.',
      outcome: 'Integrated Ondi Customer Onboarding, reducing verification turnaround to under 3 minutes and dropping abandonment to < 10%.'
    },
    stats: [
      { label: 'Onboarding Turnaround', value: '< 3m' },
      { label: 'Drop-off Reduction', value: '80%' },
      { label: 'Identity Fraud Stopped', value: '99.9%' }
    ]
  },
  individual: {
    slug: 'individual',
    title: 'Individual Solutions',
    category: 'Identity Type',
    iconName: 'Shield',
    tagline: 'Take ownership of your verified digital credential wallet.',
    description: 'Create your secure, sovereign digital identity. Store your legal credentials, university degrees, and professional records in an encrypted wallet under your direct control.',
    detailedParagraphs: [
      'Your digital identity should belong to you—not to social media companies or centralized databases. Ondi Individual Solutions gives you a secure, encrypted wallet to manage your credentials.',
      'Acquire cryptographically signed credentials from authoritative issuers (such as your school or employer) and share specific attributes selectively with institutions, keeping absolute privacy over your raw data.'
    ],
    benefits: [
      { title: 'Decentralized Custody', desc: 'Your biometric vectors and identity files are encrypted on your local device—never on a central cloud.' },
      { title: 'Selective Disclosure', desc: 'Share specific details (e.g. valid age) without revealing extra, unrelated personal data.' },
      { title: 'Reputational Capital', desc: 'Build a portable Trust Score that unlocks immediate bank loan offers and opportunities.' }
    ],
    techSpecs: [
      { label: 'Cryptography Standard', value: 'ECC Secp256r1, W3C DID Standard' },
      { label: 'Device Security', value: 'iOS Secure Enclave / Android Keystore' },
      { label: 'Format Supported', value: 'Verifiable Credentials (VC)' }
    ],
    useCase: {
      organization: 'Professional Freelancer Portal',
      challenge: 'Local engineers unable to prove degree verification to international remote hiring managers quickly.',
      outcome: 'Engineers stored verified university credentials in their Ondi wallet, proving authenticity instantly without embassy paperwork.'
    },
    stats: [
      { label: 'User Data Leaks', value: '0%' },
      { label: 'Wallet Setup Time', value: '< 2m' },
      { label: 'Verified Partners', value: '45+' }
    ]
  },
  finance: {
    slug: 'finance',
    title: 'Financial Services Solutions',
    category: 'East African Industry',
    iconName: 'Coins',
    tagline: 'Fraudless KYC, digital banking, and instant micro-credit scoring.',
    description: 'Transform financial trust. Accelerate banking compliance, prevent transaction fraud, and automate credit checks for SACCOs, micro-lenders, and banks.',
    detailedParagraphs: [
      'Financial services in East Africa require absolute security balanced with accessible customer experiences. Ondi Financial Solutions connects banks and fintechs directly to authoritative government registries.',
      'Our Trust Score Engine maps behavioral records and tax compliance to deliver a portable credit indicator, enabling lenders to safely automate loan approvals and reduce operational overhead.'
    ],
    benefits: [
      { title: 'Instant Compliance KYC', desc: 'Comply with TRA, BOT, and national anti-money laundering (AML) laws instantly.' },
      { title: 'Secure Device Auth', desc: 'Secure high-value financial transfers using biometric hardware attestation.' },
      { title: 'Micro-Lending Risk Engine', desc: 'Automate customer risk vetting using dynamic credit and behavioral score markers.' }
    ],
    techSpecs: [
      { label: 'Compliance Alignment', value: 'BOT and TRA standards compliant' },
      { label: 'Security Level', value: 'FIPS 140-2 Level 3 HSM encryption' },
      { label: 'Integrations', value: 'Temenos, Flexcube, custom core portals' }
    ],
    useCase: {
      organization: 'E-African Micro-Lending Portal',
      challenge: 'Faced high default rates due to customers registering under synthetic/fake corporate directories.',
      outcome: 'Integrated Ondi registries mapping, automatically checking BRELA and NIDA databases before loan disbursement, decreasing defaults by 52%.'
    },
    stats: [
      { label: 'KYC Turnaround Speed', value: '< 2m' },
      { label: 'Default Rates Reduced', value: '52%' },
      { label: 'Secure Transfers Handled', value: '$85M+' }
    ]
  },
  'public-sector': {
    slug: 'public-sector',
    title: 'Public Sector Solutions',
    category: 'East African Industry',
    iconName: 'Building2',
    tagline: 'Biometric citizen portal security and automated government registry integration.',
    description: 'Ensure absolute security in citizen portals. Mitigate corporate governance fraud, secure government databases, and automate regional public services registries.',
    detailedParagraphs: [
      'Digital public services must be both highly secure and accessible to every citizen. Ondi Public Sector Solutions bridges state portals with secure, biometric citizen verification.',
      'By linking directly to NIDA (National Identification Authority) registers, Ondi enables public registries to eliminate duplicate registrations, ghost accounts, and fraudulent application vetting.'
    ],
    benefits: [
      { title: 'Ghost Account Elimination', desc: 'Biometric liveness mapping ensures each registration is tied to a single legal citizen.' },
      { title: 'Secure Public Portals', desc: 'Protect critical utility, licensing, and land registration consoles with zero-trust SSO.' },
      { title: 'Interoperable Registry Nodes', desc: 'Enable different government branches to securely verify datasets without database duplicates.' }
    ],
    techSpecs: [
      { label: 'Standards Met', value: 'NIDA database sync protocols, ISO 27001' },
      { label: 'Database Encryption', value: 'AES-256 with custom government KMS' },
      { label: 'Identity Protocol', value: 'Sovereign Verifiable Credentials' }
    ],
    useCase: {
      organization: 'National Licensing Board',
      challenge: 'Widespread manual credential forgery in contractor permit applications, taking weeks to manual audit.',
      outcome: 'Automated permit verification using Ondi registry nodes, immediately catching forged filings and automating permits.'
    },
    stats: [
      { label: 'Duplicate Registrations', value: '0%' },
      { label: 'Audit Processing Time', value: 'Instant' },
      { label: 'Verified Citizens Enabled', value: '1.2M+' }
    ]
  },
  healthcare: {
    slug: 'healthcare',
    title: 'Healthcare Networks',
    category: 'East African Industry',
    iconName: 'Activity',
    tagline: 'Vetted physician registries and secure, private patient health portals.',
    description: 'Protect patient records while simplifying access. Secure internal doctor databases and enable compliant, zero-knowledge verification for healthcare portals.',
    detailedParagraphs: [
      'Healthcare portals require the highest levels of data privacy and access security. Ondi secures clinical infrastructure by eliminating password risks and implementing strict access governance.',
      'Our solutions ensure that only verified medical personnel can access sensitive patient charts, with all queries tracked in cryptographically signed audit logs that comply with privacy acts.'
    ],
    benefits: [
      { title: 'Medical Staff Vetting', desc: 'Instantly confirm credentials and licensing against official healthcare registers.' },
      { title: 'Phishing-Resistant Portals', desc: 'Secure patient databases using device-bound biometric passkey authentication.' },
      { title: 'Patient Data Minimization', desc: 'Prove insurance status or medical history attributes without exposing raw folders.' }
    ],
    techSpecs: [
      { label: 'Data Governance', value: 'HIPAA and regional Personal Data Acts compliant' },
      { label: 'Access Protocol', value: 'FIDO2 biometrics / Hardware MFA' },
      { label: 'Directory Integration', value: 'Active Directory / SCIM' }
    ],
    useCase: {
      organization: 'Regional Hospital Cooperative',
      challenge: 'Nurses and medical staff writing down database passwords on paper, risking massive data breach penalties.',
      outcome: 'Implemented biometric device authentication via Ondi, completely removing passwords and securing patient records.'
    },
    stats: [
      { label: 'Password Security Incidents', value: '0%' },
      { label: 'Staff Login Speed', value: '< 200ms' },
      { label: 'Audit Log Authenticity', value: '100%' }
    ]
  },
  retail: {
    slug: 'retail',
    title: 'Retail & E-Commerce',
    category: 'East African Industry',
    iconName: 'ShoppingBag',
    tagline: 'Fraudless merchant onboarding, customer checkouts, and payouts.',
    description: 'Secure digital trade. Instantly verify online merchants, onboarding e-commerce stores in under 3 minutes while protecting checkouts from chargeback fraud.',
    detailedParagraphs: [
      'Friction at checkout and merchant onboarding delays throttle retail growth. Ondi Retail Solutions automates vendor KYB verification and secures digital customer checkouts.',
      'By linking customer checkout portals directly to secure biometric liveness and device bindings, Ondi prevents credit card hijacking and e-commerce payment fraud.'
    ],
    benefits: [
      { title: 'Instant KYB Onboarding', desc: 'Verify merchant business status against TRA and BRELA databases in 3 minutes.' },
      { title: 'One-Click Checkout', desc: 'Enable customers to sign in and confirm checkouts using TouchID/FaceID.' },
      { title: 'Fraudulent Chargeback Def', desc: 'Establish non-repudiable biometric proof of transaction authorization.' }
    ],
    techSpecs: [
      { label: 'Registry sync speed', value: '< 800ms' },
      { label: 'Transaction Auth Method', value: 'WebAuthn Cryptographic payload' },
      { label: 'Integration Support', value: 'Shopify, WooCommerce, Custom APIs' }
    ],
    useCase: {
      organization: 'East African Fashion Marketplace',
      challenge: 'Fraudulent merchants listing fake goods and taking days of manual audit to suspend.',
      outcome: 'Implemented mandatory Ondi corporate KYB checks for merchants, immediately eliminating fake storefronts.'
    },
    stats: [
      { label: 'Merchant Onboarding Speed', value: '< 3m' },
      { label: 'Payment Fraud Rate', value: '0.01%' },
      { label: 'Transaction Latency', value: '< 400ms' }
    ]
  },
  logistics: {
    slug: 'logistics',
    title: 'Logistics & Mobility',
    category: 'East African Industry',
    iconName: 'Truck',
    tagline: 'Vetted courier directory and driver registry integration.',
    description: 'Ensure safety and security in your supply chain. Instantly verify driver identity, check national licenses, and secure field agent console access.',
    detailedParagraphs: [
      'Logistics platforms are exposed to significant asset risk if driver and courier vetting is neglected. Ondi Logistics Solutions integrates real-time identity checks into mobility platforms.',
      'Verify driver licenses and validate national registration files directly from authoritative registries, ensuring that only certified, vetted couriers handle your valuable cargo.'
    ],
    benefits: [
      { title: 'Driver Registry Vetting', desc: 'Validate national driver licensing and criminal records instantly.' },
      { title: 'Field Agent Key Security', desc: 'Ensure mobile dispatch consoles can only be unlocked by the assigned courier\'s biometrics.' },
      { title: 'Contractor Lifecycle Sync', desc: 'Automatically suspend dispatch scopes when a driver\'s contract terminates.' }
    ],
    techSpecs: [
      { label: 'Vetting Method', value: 'Direct NIDA and licensing sync' },
      { label: 'Device Attestation', value: 'Hardware-bound location and keys' },
      { label: 'Integrations', value: 'Uber API, custom routing systems' }
    ],
    useCase: {
      organization: 'Regional Freight Carrier',
      challenge: 'Faced cargo theft due to contractors register under synthetic, unverified courier profiles.',
      outcome: 'Deployed Ondi biometric driver checks, matching real-time courier faces to authoritative registries, eliminating profile theft.'
    },
    stats: [
      { label: 'Driver Vetting Latency', value: '< 3m' },
      { label: 'Cargo Theft Cases', value: '0%' },
      { label: 'Active Couriers Secured', value: '18K+' }
    ]
  },
  technology: {
    slug: 'technology',
    title: 'Technology Platforms',
    category: 'East African Industry',
    iconName: 'Globe',
    tagline: 'Secure developer APIs, SDK integration tools, and scaling portals.',
    description: 'Accelerate your deployment workflows. Connect your React, Node, or mobile software to East Africa\'s unified cryptographic trust API in under 30 minutes.',
    detailedParagraphs: [
      'Developers shouldn\'t have to spend months building custom auth pipelines, registry nodes, or biometrics libraries. Ondi Technology Platforms provides clean, high-performance APIs and SDKs.',
      'Our unified REST endpoints and client-side modules (React, Vue, Swift, Android) make it extremely simple to deploy zero-trust login, registry validation, and reputational scoring into any codebase.'
    ],
    benefits: [
      { title: 'Unified API Gateway', desc: 'Single interface managing NIDA, TRA, BRELA database queries.' },
      { title: 'Interactive Developer Docs', desc: 'Comprehensive OpenAPI schemas, testing playgrounds, and copy-paste code snippets.' },
      { title: 'Sandbox Environment', desc: 'Full sandbox environment with mocked registry payloads for rapid local testing.' }
    ],
    techSpecs: [
      { label: 'API Protocols', value: 'REST JSON / GraphQL Webhooks' },
      { label: 'Developer SDKs', value: 'React, Node.js, Python, Swift, Java' },
      { label: 'Gateway Latency', value: '< 120ms' }
    ],
    useCase: {
      organization: 'SaaS Software House',
      challenge: 'Spent 6 months attempting to custom integrate government registry nodes, stalling product launch.',
      outcome: 'Switched to Ondi Developer APIs, completing all registry integration and biometrics steps in 2 days.'
    },
    stats: [
      { label: 'Developer Setup Time', value: '< 30m' },
      { label: 'API Gateway Latency', value: '< 120ms' },
      { label: 'Developer rating', value: '4.8★' }
    ]
  },
  'non-profit': {
    slug: 'non-profit',
    title: 'Non-Profit & NGOs',
    category: 'East African Industry',
    iconName: 'Heart',
    tagline: 'Secure aid distribution registry and verified beneficiary tracking.',
    description: 'Ensure transparency in aid distribution. Eliminate beneficiary ghost profiles, protect donor capital, and secure distribution directory portals.',
    detailedParagraphs: [
      'Non-profit organizations face significant auditing hurdles if beneficiary tracking is manually run on paper spreadsheets, creating duplicate listings and distribution fraud.',
      'Ondi Non-Profit Solutions deploys decentralized, biometric credential mapping for aid recipients. Prove beneficiary authenticity and track aid dispatch transparently.'
    ],
    benefits: [
      { title: 'Beneficiary De-duplication', desc: 'Biometric liveness matches verify that each recipient registers exactly once.' },
      { title: 'Transparent Audit Trails', desc: 'Signed, tamper-proof logs tracking aid disbursements for transparent donor review.' },
      { title: 'Offline-First Verification', desc: 'Enable remote field agents to verify credentials offline using secure QR technology.' }
    ],
    techSpecs: [
      { label: 'Offline Protocol', value: 'W3C Verifiable Credentials Offline QR' },
      { label: 'Encryption', value: 'Encrypted local database with TPM keys' },
      { label: 'Compliance Standards', value: 'GDPR, localized privacy acts' }
    ],
    useCase: {
      organization: 'Regional Agricultural Aid NGO',
      challenge: 'Faced duplicate fertilizer distribution claims, losing 15% of aid bags to fraudulent registrations.',
      outcome: 'Implemented biometric attendee verification via Ondi QR tokens, reducing duplication fraud cases to 0%.'
    },
    stats: [
      { label: 'Aid Theft Reduction', value: '100%' },
      { label: 'Beneficiary Sign-up Speed', value: '< 2m' },
      { label: 'NGO Audit Compliancy', value: '100%' }
    ]
  },
  energy: {
    slug: 'energy',
    title: 'Energy & Utilities',
    category: 'East African Industry',
    iconName: 'Flame',
    tagline: 'Secure smart grid dashboards and verified field agent directory.',
    description: 'Protect critical infrastructure. Secure utility smart grid dashboards from remote threats and verify the credentials of field agents instantly.',
    detailedParagraphs: [
      'Energy and utilities grids are critical national infrastructure that must be heavily secured against remote intrusions. Ondi binds control grid logins strictly to compliant, registered corporate devices.',
      'Additionally, field utility workers can share secure, digital Ondi credential tokens with customers, proving their verified corporate employment and preventing home-invasion fraud.'
    ],
    benefits: [
      { title: 'Smart Grid Lock', desc: 'Secure sensitive SCADA and smart grid consoles using biometric FIDO2 hardware.' },
      { title: 'Field Agent Verification', desc: 'Secure QR credentials that customers can scan to instantly verify utility worker authenticity.' },
      { title: 'Subcontractor Scopes Governance', desc: 'Ensure contractor access automatically expires when maintenance contracts finish.' }
    ],
    techSpecs: [
      { label: 'Infrastructure Standard', value: 'FIPS 140-2 compliance' },
      { label: 'Verification Protocol', value: 'Secure QR attestation payload' },
      { label: 'Directory Integration', value: 'SCIM / AD synchronization' }
    ],
    useCase: {
      organization: 'Solar Smart-Grid Operator',
      challenge: 'Imposters posing as utility maintenance workers to access customer residential properties, threatening reputation.',
      outcome: 'Equipped all technicians with secure Ondi employee badges, enabling residents to verify staff via a simple smartphone scan.'
    },
    stats: [
      { label: 'Consoles Secured', value: '100%' },
      { label: 'Imposter Incidents', value: '0%' },
      { label: 'Technicians Vetted', value: '3.4K' }
    ]
  }
};

export const COMPANY_DATA: Record<string, MenuPageConfig> = {
  'responsible-identity': {
    slug: 'responsible-identity',
    title: 'Responsible Identity',
    category: 'About',
    iconName: 'Scale',
    tagline: 'Our uncompromising commitment to user privacy, data sovereignty, and explicit consent.',
    description: 'Digital identity must not mean digital surveillance. We believe in an infrastructure that is secure, user-owned, transparently governed, and private by default.',
    detailedParagraphs: [
      'In an increasingly digitized world, personal data has become a corporate commodity. Ondi is engineered to oppose this. We operate under a strict "Responsible Identity" framework, which means your digital records belong to you, and only you.',
      'We do not compile centralized profiles, sell user behavior, or store unencrypted biometric vectors on our cloud platforms. All credential attributes are consent-gated: third-party services can only view what you explicitly approve, and you can revoke that permission instantly.'
    ],
    benefits: [
      { title: 'Data Minimization', desc: 'We utilize zero-knowledge proofs to ensure that verification never requires sharing raw, unnecessary files.' },
      { title: 'Revocable Sharing', desc: 'Every data access consent log is user-owned and can be terminated at any time.' },
      { title: 'No Central Honeypots', desc: 'User credentials are secure inside their local device secure enclaves, removing central database leak risks.' }
    ],
    techSpecs: [
      { label: 'Privacy Framework', value: 'GDPR Aligned / TZ PDPA 2022' },
      { label: 'Biometric Custody', value: 'On-device Local Keystore only' },
      { label: 'Encryption Protocol', value: 'Zero-Knowledge Proofs (Bulletproofs)' }
    ],
    useCase: {
      organization: 'Digital Human Rights Alliance',
      challenge: 'Faced concerns over biometric database pooling and central state tracking in digital wallet designs.',
      outcome: 'Ondi demonstrated FIDO2 and local enclave binding specs, satisfying the strictest human rights data sovereignty checklists.'
    },
    stats: [
      { label: 'User Data Sold', value: '0%' },
      { label: 'Consent Controls Provided', value: '100%' },
      { label: 'Audit Log Inmutability', value: '100%' }
    ]
  },
  'social-impact': {
    slug: 'social-impact',
    title: 'Social Impact Strategy',
    category: 'About',
    iconName: 'Compass',
    tagline: 'Driving digital inclusion, financial access, and secure opportunity across East Africa.',
    description: 'Bridges economic divides. We build high-fidelity trust infrastructure to enable micro-entrepreneurs, freelancers, and rural citizens to access premium global capital.',
    detailedParagraphs: [
      'Digital identity is a human right. Millions of hardworking East Africans are excluded from global work and credit systems because they lack portable, verified reputations. Ondi bridges this exclusion.',
      'Our platforms enable citizens to build verified reputational capital from their daily business compliance, NIDA registrations, and financial consistencies, converting this trust into access to micro-credit, global work, and utilities.'
    ],
    benefits: [
      { title: 'Digital Inclusion', desc: 'Works across low-bandwidth environments, with support for offline QR and SMS integrations.' },
      { title: 'Financial Inclusion', desc: 'Secure trust scores enable local lenders to issue loans to thin-file, rural SACCO members safely.' },
      { title: 'Job Passport Integration', desc: 'Enable young East African engineers to verify degrees instantly to secure high-paying remote roles.' }
    ],
    techSpecs: [
      { label: 'Offline Capability', value: 'Offline QR verification protocol' },
      { label: 'Ecosystem Integrations', value: 'E-services, microfinance registries' },
      { label: 'Access Level', value: 'Free personal wallet for individuals' }
    ],
    useCase: {
      organization: 'Agricultural Micro-Enterprise League',
      challenge: 'Thin-file rural farmers unable to access credit to purchase irrigation tools, lacking bank accounts or asset collateral.',
      outcome: 'Farmers established Ondi Trust Scores based on cooperative harvest consistency, securing smart micro-credit directly.'
    },
    stats: [
      { label: 'Rural Farmers Enabled', value: '45K+' },
      { label: 'thin-file Loan Approvals', value: '82%' },
      { label: 'Economic Value Unlocked', value: '$12M+' }
    ]
  },
  careers: {
    slug: 'careers',
    title: 'Careers at Ondi',
    category: 'Ecosystem',
    iconName: 'Briefcase',
    tagline: 'Join us in building the digital trust foundation of Africa.',
    description: 'We are engineering the future of decentralized trust infrastructure. If you are passionate about cryptography, data sovereignty, and pan-African development, join our distributed engineering team.',
    detailedParagraphs: [
      'At Ondi, we don\'t just write code; we build the foundational pipes of the future African digital economy. Our remote-first, distributed engineering team spans Dar es Salaam, Nairobi, Kampala, and Kigali.',
      'We operate under a high-autonomy, high-accountability framework, working on cutting-edge zero-trust authentication, bulletproof zero-knowledge proofs, SCIM directory synchronization, and registry nodes integrations.'
    ],
    benefits: [
      { title: 'Pan-African Vision', desc: 'Work on products that immediately impact the digital lives of millions of East African citizens.' },
      { title: 'Engineering Excellence', desc: 'Build advanced, state-of-the-art cryptographic wallets using FIDO2 and Secure Enclaves.' },
      { title: 'Distributed Flexibility', desc: 'Remote-first team with access to beautiful partner co-working nodes in major cities.' }
    ],
    techSpecs: [
      { label: 'Work Culture', value: 'Remote-first, high autonomy' },
      { label: 'Stack Used', value: 'Next.js, TypeScript, Rust, Go, PostgreSQL' },
      { label: 'Core Values', value: 'User Sovereignty, Transparency, Execution' }
    ],
    useCase: {
      organization: 'Ondi Cryptography Lab',
      challenge: 'Need to research, optimize, and deploy zero-knowledge proof algorithms that can run on low-end smartphones locally.',
      outcome: 'Recruited world-class regional computer science graduates to deploy custom, ultra-light ZKP engines inside the Ondi wallet.'
    },
    stats: [
      { label: 'Team Nationalities', value: '6+' },
      { label: 'Distributed Engineers', value: '38' },
      { label: 'Annual Training Budget', value: '$4K/engineer' }
    ]
  },
  partners: {
    slug: 'partners',
    title: 'Ecosystem Partners',
    category: 'Ecosystem',
    iconName: 'Network',
    tagline: 'Join the East African alliance registry nodes network.',
    description: 'Establish federated trust nodes. Bridge your enterprise software, validation nodes, or registries with Ondi to build East Africa\'s unified identity ecosystem.',
    detailedParagraphs: [
      'Trust scales through partnership. The Ondi Alliance Registry Nodes network comprises financial regulators, regional authorities, leading fintechs, and tech platforms.',
      'By joining the partner network, your organization can cryptographically issue verifiable credentials, securely validate client identities in milliseconds, and contribute to regional fraud-detection data graphs.'
    ],
    benefits: [
      { title: 'Direct Node Authority', desc: 'Issue verifiable identity credentials that are instantly trusted across all connected partner applications.' },
      { title: 'Ecosystem Lead Sharing', desc: 'Cross-network integrations introduce verified, high-trust users to your banking or e-commerce applications.' },
      { title: 'Registry Group Governance', desc: 'Participate in the decentralized governance of trust schemas and credential standards.' }
    ],
    techSpecs: [
      { label: 'Node Standards', value: 'W3C Decentralized Identifiers (DID)' },
      { label: 'Consensus Method', value: 'Federated Cryptographic Signatures' },
      { label: 'Data Sync Latency', value: '< 200ms' }
    ],
    useCase: {
      organization: 'Regional SACCO Alliance Group',
      challenge: 'Faced high identity fraud across 25 separate microfinance cooperative networks due to fragmented databases.',
      outcome: 'Joined Ondi Ecosystem Partners, deploying a shared verified credit-check node that decreased regional identity fraud to 0%.'
    },
    stats: [
      { label: 'Registry Nodes Connected', value: '14+' },
      { label: 'Partner Transactions Checked', value: '150M+' },
      { label: 'Ecosystem Integration Speed', value: '< 2 days' }
    ]
  }
};
