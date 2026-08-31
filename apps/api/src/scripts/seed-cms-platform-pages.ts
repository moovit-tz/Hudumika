/**
 * Seed the two real Hudumika platform pages (Privacy Policy, Terms of
 * Service) into cms_pages (tenant_id NULL), transcribed from the previously
 * hardcoded content in apps/web/src/pages/{PrivacyPolicy,TermsOfService}.tsx
 * so nothing regresses when those pages switch from static JSX to fetching
 * from the CMS. Section <h2 id="..."> values match the original TOC anchor
 * ids exactly (e.g. "information-we-collect") so existing deep links keep
 * working. Two originally bespoke-styled sub-widgets (Privacy's icon "Rights"
 * card grid, both pages' icon "Contact" panel) are represented here as plain
 * lists/paragraphs — a deliberate, disclosed simplification so the content
 * is genuinely editable prose rather than fixed layout, at the cost of their
 * original card-grid visual treatment.
 *
 * Usage:  npx tsx src/scripts/seed-cms-platform-pages.ts
 * Re-runnable: upserts by slug (tenant_id IS NULL) — safe to run again.
 */
import { db } from '../db/client.js';
import { CMSService } from '../services/cms.service.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const PRIVACY_CONTENT = `
<h2 id="information-we-collect">Information We Collect</h2>
<p>We collect information you provide directly, information generated automatically through your use of our services, and information from third-party sources where lawfully permitted.</p>
<table>
  <thead><tr><th>Category</th><th>Data Collected</th><th>Purpose</th></tr></thead>
  <tbody>
    <tr><td>Identity</td><td>Full name, email address, phone number</td><td>Account creation, communication, authentication</td></tr>
    <tr><td>Organisation</td><td>Company name, registration number, tax ID, address</td><td>Billing, compliance, KYC verification</td></tr>
    <tr><td>Operational</td><td>Shipment data, manifests, clearance documents, cargo details</td><td>Service delivery, customs workflows</td></tr>
    <tr><td>Financial</td><td>Invoice data, payment method, transaction history</td><td>Billing, fraud prevention, financial reporting</td></tr>
    <tr><td>Technical</td><td>IP address, browser type, device ID, session tokens</td><td>Security, authentication, platform performance</td></tr>
    <tr><td>Usage</td><td>Feature interactions, page views, error logs</td><td>Product improvement, support, analytics</td></tr>
    <tr><td>Communications</td><td>Support tickets, chat messages, emails</td><td>Customer support, record-keeping</td></tr>
  </tbody>
</table>

<h2 id="how-we-use">How We Use Your Data</h2>
<p>We use personal information only for purposes consistent with why it was collected:</p>
<ul>
  <li><strong>Deliver and operate the platform</strong> — shipment management, customs workflows, compliance tracking, invoicing, and all other product features.</li>
  <li><strong>Authenticate and secure your account</strong> — identity verification, session management, fraud detection, and two-factor authentication.</li>
  <li><strong>Billing and financial compliance</strong> — processing payments, generating VAT-compliant invoices, and maintaining audit-ready financial records.</li>
  <li><strong>Customer support</strong> — responding to tickets, troubleshooting issues, and following up on reported problems.</li>
  <li><strong>Product improvement</strong> — aggregated and anonymised usage analytics to improve platform performance and prioritise new features.</li>
  <li><strong>Legal obligations</strong> — complying with tax authority requirements (TRA), BRELA filings, regulatory mandates, and lawful orders from competent authorities.</li>
  <li><strong>Communication</strong> — transactional notifications (deadline alerts, filing confirmations, renewal reminders) and, with your consent, product updates.</li>
</ul>
<p>We do <strong>not</strong> sell your personal data to third parties. We do not use your data for automated decision-making that produces legal or similarly significant effects without human review.</p>

<h2 id="legal-basis">Legal Basis for Processing</h2>
<p>Our processing of your personal data is grounded in the following lawful bases under applicable data protection law:</p>
<ul>
  <li><strong>Contract performance</strong> — processing necessary to provide the services you have contracted with us.</li>
  <li><strong>Legal obligation</strong> — processing required to comply with Tanzanian tax, customs, and corporate law.</li>
  <li><strong>Legitimate interests</strong> — platform security, fraud prevention, and service improvement, balanced against your privacy rights.</li>
  <li><strong>Consent</strong> — marketing communications and optional analytics features, which you may withdraw at any time.</li>
</ul>

<h2 id="data-sharing">Data Sharing &amp; Disclosure</h2>
<p>We share personal data only in limited, defined circumstances:</p>
<ul>
  <li><strong>Service providers</strong> — cloud hosting (AWS/GCP), payment processors, email delivery providers, and analytics tools operating under strict data processing agreements.</li>
  <li><strong>Government and regulatory agencies</strong> — BRELA, TRA, NSSF, WCF, OSHA, and other Tanzanian regulatory bodies where your filings require data submission.</li>
  <li><strong>Your tenant organisation</strong> — other authorised users within your company account may have access to operational data depending on their assigned role.</li>
  <li><strong>Legal process</strong> — where required by valid court order, subpoena, or binding government request.</li>
  <li><strong>Business transfers</strong> — in the event of a merger or acquisition, subject to equivalent privacy protections.</li>
</ul>

<h2 id="data-retention">Data Retention</h2>
<p>We retain your personal data for as long as your account is active or as needed to provide services. Upon account termination, we retain data for a minimum of <strong>7 years</strong> to satisfy Tanzanian tax and corporate record-keeping obligations.</p>
<p>Specific retention periods by category:</p>
<ul>
  <li><strong>Financial records</strong> (invoices, payments, tax filings) — 7 years minimum.</li>
  <li><strong>Shipment and customs documents</strong> — 5 years from completion.</li>
  <li><strong>Support ticket history</strong> — 3 years.</li>
  <li><strong>Access logs and technical data</strong> — 12 months rolling.</li>
  <li><strong>Marketing consent records</strong> — until consent is withdrawn plus 2 years.</li>
</ul>
<p>After the applicable retention period, data is securely deleted or anonymised.</p>

<h2 id="your-rights">Your Rights</h2>
<p>Depending on your location, you may have the following rights regarding your personal data:</p>
<ul>
  <li><strong>Right of Access</strong> — Request a complete copy of all personal data we hold about you at any time.</li>
  <li><strong>Right to Rectify</strong> — Correct inaccurate or incomplete data in your profile or associated records.</li>
  <li><strong>Right to Erasure</strong> — Request deletion of your personal data, subject to legal retention obligations.</li>
  <li><strong>Data Portability</strong> — Export your data in a machine-readable format (JSON or CSV) at any time.</li>
  <li><strong>Right to Object</strong> — Object to processing based on legitimate interests or direct marketing.</li>
  <li><strong>Restrict Processing</strong> — Request that we limit processing while a dispute or review is underway.</li>
</ul>
<p>To exercise any of these rights, email <a href="mailto:privacy@hudumika.tz">privacy@hudumika.tz</a>. We will respond within 30 days. Some requests may be subject to legal limitations or identity verification.</p>

<h2 id="security">Security Measures</h2>
<p>We implement industry-standard technical and organisational measures to protect your data:</p>
<ul>
  <li>AES-256 encryption at rest; TLS 1.3 in transit.</li>
  <li>Role-based access controls with principle of least privilege.</li>
  <li>Multi-factor authentication for administrator and privileged access.</li>
  <li>Automated intrusion detection and anomaly monitoring.</li>
  <li>Regular security audits and penetration testing.</li>
  <li>Secure data backup with geo-redundancy across multiple availability zones.</li>
</ul>
<p>Despite our measures, no system is 100% secure. If you believe your account has been compromised, contact <a href="mailto:security@hudumika.tz">security@hudumika.tz</a> immediately.</p>

<h2 id="cookies">Cookies &amp; Tracking</h2>
<p>We use session cookies for authentication and a small set of analytics cookies to understand aggregate usage patterns. We do not use third-party advertising trackers. You can control cookies via your browser settings, though disabling session cookies will prevent login.</p>

<h2 id="international">International Transfers</h2>
<p>Data is primarily stored and processed within the African Union region. Where data is transferred outside Tanzania, we ensure appropriate safeguards are in place including Standard Contractual Clauses or equivalent protective mechanisms.</p>

<h2 id="changes">Changes to This Policy</h2>
<p>We may update this Privacy Policy to reflect changes in law, technology, or our practices. We will notify account holders of material changes by in-app notification or email at least 14 days before the change takes effect. Continued use of the platform after that date constitutes acceptance.</p>

<h2 id="contact">Contact &amp; DPO</h2>
<p><strong>Data Protection Office</strong><br/>
Hudumika Ltd · Plot 123, Maktaba Street · Dar es Salaam, Tanzania<br/>
Email: <a href="mailto:privacy@hudumika.tz">privacy@hudumika.tz</a><br/>
For urgent data breach notifications: <a href="mailto:security@hudumika.tz">security@hudumika.tz</a></p>
`.trim();

const TERMS_CONTENT = `
<h2 id="acceptance">Acceptance of Terms</h2>
<p>These Terms of Service ("Terms") constitute a legally binding agreement between you (or your organisation) and <strong>Hudumika Ltd</strong>, a company incorporated in Tanzania ("Hudumika", "we", "us", "our"). "You" refers to the individual or entity accepting these Terms.</p>
<p>By creating an account, inviting users, or using any Hudumika service, you represent that you have read, understood, and agree to these Terms. If you are accepting on behalf of a company, you represent that you have authority to bind that company.</p>

<h2 id="eligibility">Eligibility &amp; Account Registration</h2>
<p>You must be at least 18 years old and legally capable of entering contracts to use Hudumika. Business accounts must represent a legitimately incorporated entity.</p>
<p>You are responsible for:</p>
<ul>
  <li>Providing accurate, complete, and current registration information at all times.</li>
  <li>Maintaining the security and confidentiality of your login credentials.</li>
  <li>All activity that occurs under your account, whether authorised or not.</li>
  <li>Promptly notifying us of any suspected unauthorised access or security breach.</li>
</ul>
<p>We reserve the right to reject registrations, require additional KYC documentation, or suspend accounts that violate these Terms or applicable law.</p>

<h2 id="licence">Licence Grant &amp; Restrictions</h2>
<p>Subject to your compliance with these Terms, Hudumika grants you a limited, non-exclusive, non-transferable, revocable licence to access and use the platform solely for your internal business operations during your subscription period.</p>
<p>You may <strong>not</strong>:</p>
<ul>
  <li>Sublicense, resell, transfer, or share access to the platform with any third party outside your authorised user seats.</li>
  <li>Reverse engineer, decompile, or derive source code from any part of the platform.</li>
  <li>Use the platform to provide services to competitors of Hudumika without written consent.</li>
  <li>Circumvent, disable, or interfere with any security features or access controls.</li>
  <li>Use automated scripts, bots, or scrapers to extract data from the platform at scale.</li>
</ul>

<h2 id="obligations">User Obligations</h2>
<p>You agree to use the platform in compliance with all applicable Tanzanian laws, regulations, and these Terms. In particular, you agree:</p>
<ul>
  <li>Not to upload, transmit, or process data that infringes intellectual property rights or violates any law.</li>
  <li>Not to use the platform for any fraudulent, deceptive, or illegal purpose, including money laundering or sanctions evasion.</li>
  <li>To maintain adequate controls over your own systems to prevent unauthorised access to our platform.</li>
  <li>To ensure that all users you invite operate within the scope of their assigned roles.</li>
  <li>Not to interfere with the availability or integrity of the platform for other users.</li>
</ul>

<h2 id="data-content">Your Data &amp; Content</h2>
<p>You retain full ownership of all data, documents, and content you upload to the platform ("Customer Data"). You grant Hudumika a limited licence to process Customer Data solely as necessary to provide the services.</p>
<p>You represent that you have all rights necessary to upload and process your Customer Data on the platform, including compliance with relevant data protection obligations toward your own customers and employees.</p>
<p>We will never access your Customer Data for any purpose other than providing and improving the platform, except as required by law or with your explicit written consent.</p>

<h2 id="payment">Payment &amp; Billing</h2>
<p>Subscription fees are as agreed in your Order Form or selected plan at time of sign-up. All fees are in Tanzania Shillings (TZS) unless otherwise specified and are exclusive of applicable VAT.</p>
<ul>
  <li><strong>Monthly plans</strong> — billed in advance on the same date each month.</li>
  <li><strong>Annual plans</strong> — billed annually in advance with a discount as advertised at time of purchase.</li>
  <li><strong>Late payment</strong> — accounts not paid within 14 days of due date may be suspended. Interest on overdue amounts accrues at 2% per month.</li>
  <li><strong>Refunds</strong> — monthly fees are non-refundable after the billing cycle begins. Annual fees may be prorated for refund within 30 days of purchase if requested in writing.</li>
  <li><strong>Price changes</strong> — we will give at least 60 days' advance notice of price increases for existing subscriptions.</li>
</ul>

<h2 id="sla">Service Availability (SLA)</h2>
<p>We target <strong>99.5% monthly uptime</strong> for the core platform. Scheduled maintenance windows (communicated at least 48 hours in advance) and force majeure events are excluded from SLA calculations.</p>
<p>In the event of a verified SLA breach exceeding 0.5% downtime in a calendar month, your sole remedy is a service credit of 5% of that month's subscription fee, applied to a future invoice, upon written request within 30 days.</p>

<h2 id="ip">Intellectual Property</h2>
<p>Hudumika and its licensors own all rights in the platform, including all software, interfaces, design, algorithms, documentation, trademarks, and trade secrets. Nothing in these Terms transfers any ownership of Hudumika's intellectual property to you.</p>
<p>Any feedback, suggestions, or feature requests you provide may be used by Hudumika without obligation or compensation to you.</p>

<h2 id="confidential">Confidentiality</h2>
<p>Each party may have access to the other's non-public business information ("Confidential Information"). Each party agrees to hold the other's Confidential Information in strict confidence, use it only as necessary to perform under these Terms, and not disclose it to any third party without written consent. This obligation survives termination of these Terms for 5 years.</p>

<h2 id="liability">Limitation of Liability</h2>
<p>To the maximum extent permitted by applicable law:</p>
<ul>
  <li>Hudumika's total aggregate liability to you arising from or related to these Terms shall not exceed the <strong>total fees paid by you in the 12 months preceding the claim</strong>.</li>
  <li>Neither party shall be liable for indirect, consequential, special, incidental, or punitive damages, including loss of profits or data, even if advised of the possibility.</li>
  <li>Hudumika does not warrant that the platform will be error-free, uninterrupted, or that filings made through the platform will be accepted by any government agency.</li>
</ul>

<h2 id="indemnity">Indemnification</h2>
<p>You agree to indemnify, defend, and hold harmless Hudumika and its officers, directors, employees, and agents from and against any claims, damages, penalties, fines, losses, and expenses (including reasonable legal fees) arising from: (a) your use of the platform in violation of these Terms; (b) your Customer Data or filings; (c) your breach of applicable law; or (d) any third-party claims arising from your actions on the platform.</p>

<h2 id="termination">Term &amp; Termination</h2>
<p>These Terms remain in effect for the duration of your subscription. Either party may terminate:</p>
<ul>
  <li><strong>By you</strong> — with 30 days' notice before your next renewal date via the account settings or written request.</li>
  <li><strong>By us for breach</strong> — immediately if you materially breach these Terms and fail to cure within 14 days of written notice.</li>
  <li><strong>By us for cause</strong> — immediately if you engage in fraud, illegal activity, or actions that threaten platform security.</li>
</ul>
<p>Upon termination, your access will be revoked. We will retain your data per our retention policy and make it available for export for 30 days following termination.</p>

<h2 id="governing-law">Governing Law</h2>
<p>These Terms are governed by the laws of the <strong>United Republic of Tanzania</strong>. Any disputes shall be referred first to good-faith negotiation, then to binding arbitration under the rules of the Tanzania Arbitration Centre in Dar es Salaam, conducted in English. Judgment on any arbitral award may be entered in any court of competent jurisdiction.</p>

<h2 id="changes">Changes to Terms</h2>
<p>We may update these Terms at any time. We will notify you of material changes via in-app notification or email at least <strong>30 days</strong> before they take effect. Continued use of the platform after that date constitutes acceptance of the revised Terms.</p>

<h2 id="contact">Contact Us</h2>
<p><strong>Legal Department</strong><br/>
Hudumika Ltd · Plot 123, Maktaba Street · Dar es Salaam, Tanzania<br/>
Email: <a href="mailto:legal@hudumika.tz">legal@hudumika.tz</a><br/>
For support inquiries: <a href="/support-ticket">Open a Support Ticket</a></p>
`.trim();

// Transcribed from the previously bespoke-designed apps/web/src/pages/ComplyOSSales.tsx
// (821 lines — hero, pricing/ROI calculator, sector matrix, agency grid, FAQ) per the
// user's confirmed choice to fully convert it into generic, editable CMS content. This
// necessarily drops the interactive elements (phase tabs, ROI sliders, live BRELA search
// demo, pricing cards) since a rich-text page can't reproduce app functionality — only
// their real informational content survives, reformatted as prose/tables/lists. No
// numbers or claims are invented; all figures below are the same ones already in the
// component (hoursSaved/penalties figures were computed from user-adjustable slider
// inputs in the live calculator and have no single fixed value, so they are described
// qualitatively here rather than restated as a specific number that was never fixed).
const WHY_COMPLYOS_CONTENT = `
<h2 id="overview">Your BRELA, TRA and NSSF filings — handled, not chased</h2>
<p>ComplyOS replaces spreadsheets, missed deadlines, and manual follow-ups with a structured system that tracks due dates, auto-fills filings, and manages renewals before penalties occur. It covers 8+ Tanzanian government agencies, requires no credit card to try, and sets up in about 5 minutes.</p>

<h2 id="the-problem">Why compliance management in East Africa needs structure, not spreadsheets</h2>
<ul>
<li><strong>Deadlines trapped in spreadsheets</strong> — or managed informally by individual staff. One missed deadline results in late penalty notices and unexpected operational delays.</li>
<li><strong>Redundant manual retyping</strong> — re-entering identical company details, re-uploading documents, and navigating multiple agency portals year after year.</li>
<li><strong>Delayed due diligence verification</strong> — when banks, investors, or enterprise clients request compliance verification, gathering physical documents takes days.</li>
</ul>

<h2 id="how-it-works">A structured 7-phase compliance lifecycle</h2>
<p>The phases running behind every certificate in your vault:</p>
<ul>
<li><strong>1. Obligation Mapping</strong> — Register your entity, select your industry and jurisdiction, and ComplyOS cross-references live regulatory requirements across BRELA, TRA, NSSF, WCF, OSHA, TBS, and TMDA to build a complete compliance schedule in minutes.</li>
<li><strong>2. Document Extraction</strong> — Upload existing PDFs or official documents (TIN certificates, business licences, BRELA filings) and the extraction engine parses registration numbers, issue dates, and expiry deadlines into your secure vault.</li>
<li><strong>3. Unified Submission</strong> — Direct API connections where supported (BRELA ORS, TRA EFD/TIN), automated portal workflows where APIs are absent, and verified dispatch tracking for specialised agencies — all filings managed from one dashboard.</li>
<li><strong>4. Live Tracking</strong> — Continuous status updates with instant notifications via WhatsApp, email, and dashboard alerts the moment an official approves, queries, or updates your filing status.</li>
<li><strong>5. Resolution Engine</strong> — If an agency issues a query or rejection, the system prepares a structured response with legal citations, ready for team review or direct escalation to partner law firms.</li>
<li><strong>6. Encrypted Vault</strong> — Role-based permissions for leadership, finance, and legal teams, with audit-ready compliance packages exportable instantly for banks, investors, or enterprise procurement audits.</li>
<li><strong>7. Auto-Renewals</strong> — 90, 60, and 30 days before expiration, ComplyOS prepares renewal filings pre-populated from past submissions — review and approve with one click.</li>
</ul>

<h2 id="sectors">Sector-specific obligations</h2>
<p>ComplyOS configures your compliance calendar according to your specific line of business. Representative obligations by sector:</p>

<h3>General Trade &amp; Commercial</h3>
<table>
<thead><tr><th>Agency</th><th>Obligation</th><th>Frequency</th><th>Risk</th></tr></thead>
<tbody>
<tr><td>BRELA</td><td>Annual Company Return &amp; Beneficial Ownership Filing</td><td>Annual</td><td>Critical</td></tr>
<tr><td>TRA</td><td>Tax Compliance Certificate (TCC) &amp; Provisional Tax Returns</td><td>Quarterly/Annual</td><td>Critical</td></tr>
<tr><td>NSSF</td><td>Monthly Employee Pension Contributions &amp; Roster Sync</td><td>Monthly</td><td>High</td></tr>
<tr><td>WCF</td><td>Workers Compensation Fund Assessment &amp; Annual Return</td><td>Monthly/Annual</td><td>High</td></tr>
<tr><td>City Council</td><td>Local Business Licence Renewal (Manispaa)</td><td>Annual</td><td>Medium</td></tr>
</tbody>
</table>

<h3>Manufacturing &amp; Industry</h3>
<table>
<thead><tr><th>Agency</th><th>Obligation</th><th>Frequency</th><th>Risk</th></tr></thead>
<tbody>
<tr><td>OSHA</td><td>Workplace Safety Inspection &amp; Registration Certificate</td><td>Annual</td><td>Critical</td></tr>
<tr><td>TBS</td><td>Standardization Mark &amp; Product Quality Certification</td><td>Annual</td><td>Critical</td></tr>
<tr><td>NEMC</td><td>Environmental Impact Assessment (EIA) Audit Report</td><td>Bi-Annual</td><td>Critical</td></tr>
<tr><td>BRELA</td><td>Annual Return &amp; Registered Office Verification</td><td>Annual</td><td>High</td></tr>
<tr><td>TRA</td><td>Excise Duty &amp; VAT Monthly Return Submissions</td><td>Monthly</td><td>High</td></tr>
</tbody>
</table>

<h3>Food, Pharma &amp; Agriculture</h3>
<table>
<thead><tr><th>Agency</th><th>Obligation</th><th>Frequency</th><th>Risk</th></tr></thead>
<tbody>
<tr><td>TFDA / TMDA</td><td>Food &amp; Drug Facility Registration &amp; Storage Permit</td><td>Annual</td><td>Critical</td></tr>
<tr><td>TBS</td><td>Batch Conformity Assessment &amp; Export Clearance</td><td>Per Shipment</td><td>Critical</td></tr>
<tr><td>Ministry of Agriculture</td><td>Phytosanitary Export Certificate &amp; Licence</td><td>Per Shipment</td><td>High</td></tr>
<tr><td>TRA</td><td>Customs Import/Export Tax Clearance &amp; EFD Receipts</td><td>Continuous</td><td>High</td></tr>
<tr><td>BRELA</td><td>Company Secretary &amp; Director Filings</td><td>Annual</td><td>Medium</td></tr>
</tbody>
</table>

<h3>Financial Services &amp; FinTech</h3>
<table>
<thead><tr><th>Agency</th><th>Obligation</th><th>Frequency</th><th>Risk</th></tr></thead>
<tbody>
<tr><td>BOT</td><td>Bank of Tanzania Payment System / Microfinance Licence</td><td>Annual</td><td>Critical</td></tr>
<tr><td>CMSA</td><td>Capital Markets Dealer &amp; Investment Adviser Compliance</td><td>Annual</td><td>Critical</td></tr>
<tr><td>FIU</td><td>Anti-Money Laundering (AML) Compliance &amp; STR Reporting</td><td>Monthly</td><td>Critical</td></tr>
<tr><td>BRELA</td><td>Share Allotment, Mortgages &amp; Charge Register Updates</td><td>Event-driven</td><td>High</td></tr>
<tr><td>TRA</td><td>Withholding Tax &amp; Corporate Tax Audit Clearance</td><td>Monthly/Annual</td><td>High</td></tr>
</tbody>
</table>

<h2 id="agencies">Government agencies monitored</h2>
<table>
<thead><tr><th>Agency</th><th>What ComplyOS tracks</th></tr></thead>
<tbody>
<tr><td>BRELA — Business Registrations and Licensing Agency</td><td>Company incorporation, annual returns, beneficial ownership &amp; name searches.</td></tr>
<tr><td>TRA — Tanzania Revenue Authority</td><td>TIN registration, Tax Compliance Certificates (TCC), VAT &amp; EFD integration.</td></tr>
<tr><td>NSSF — National Social Security Fund</td><td>Employer portal registration, monthly employee contributions &amp; compliance clearance.</td></tr>
<tr><td>WCF — Workers Compensation Fund</td><td>Workplace injury insurance compliance, tariff assessments &amp; employee filings.</td></tr>
<tr><td>OSHA — Occupational Safety and Health Authority</td><td>Factory &amp; office safety audits, health inspection certificates &amp; risk compliance.</td></tr>
<tr><td>TBS — Tanzania Bureau of Standards</td><td>Product quality certification, batch testing approval &amp; import conformity marks.</td></tr>
<tr><td>TFDA / TMDA — Medicines &amp; Medical Devices Authority</td><td>Food facility registration, pharmaceutical distribution licences &amp; premises permits.</td></tr>
<tr><td>BOT — Bank of Tanzania</td><td>Financial institution oversight, FX compliance, AML reports &amp; fintech authorisation.</td></tr>
</tbody>
</table>

<h2 id="faqs">Frequently asked questions</h2>
<p><strong>Does ComplyOS submit filings directly to BRELA, TRA, and NSSF?</strong><br/>
Yes. ComplyOS integrates directly with government portals (including BRELA ORS, TRA EFD/TCC system, and NSSF portal). Where automated APIs exist, submissions occur in real-time. Where manual processing is required, ComplyOS manages dispatch with official tracking references.</p>
<p><strong>Can I search company details directly from BRELA inside ComplyOS?</strong><br/>
Yes. ComplyOS includes a built-in BRELA Public Search tool. You can search any registered business name or incorporation number directly inside ComplyOS to verify standing, incorporation dates, and director records.</p>
<p><strong>What happens if a government agency queries or rejects a submission?</strong><br/>
ComplyOS alerts you immediately via WhatsApp, email, and dashboard notifications. The system prepares a structured response referencing applicable East African legislation, ready for your review or direct escalation to partner law firms.</p>
<p><strong>Can ComplyOS manage compliance for multiple companies or subsidiaries?</strong><br/>
Yes. ComplyOS is designed for holding companies, corporate groups, and legal or accounting firms. You can manage multiple entities under a single master account with granular role-based access control.</p>
<p><strong>How does the free trial work?</strong><br/>
You receive a 14-day full access trial with no credit card required. Upon sign-up, the system inventories your obligations and generates your compliance schedule in under 5 minutes.</p>

<h2 id="get-started">Get started</h2>
<p>Free 14-day access, zero credit card required, roughly 5-minute onboarding. <a href="/signup">Start your free trial</a> or email <a href="mailto:sales@hudumika.tz">sales@hudumika.tz</a> to request an enterprise demo.</p>
`.trim();

async function main() {
  // A stable system-author id — the GLOBAL_TENANT_ID sentinel is already
  // used elsewhere (platform.routes.ts) as a non-tenant-specific anchor;
  // reuse it as the author marker for seed-authored platform content.
  const authorId = GLOBAL_TENANT_ID;

  const privacy = await CMSService.upsertPlatformPage(authorId, {
    slug: 'privacy',
    title: 'Privacy Policy',
    content: PRIVACY_CONTENT,
    status: 'published',
    seo_description: 'How Hudumika collects, uses, and protects your personal information.',
  });
  console.log('Seeded platform page:', privacy.slug, '—', privacy.status);

  const terms = await CMSService.upsertPlatformPage(authorId, {
    slug: 'terms',
    title: 'Terms of Service',
    content: TERMS_CONTENT,
    status: 'published',
    seo_description: 'The terms governing your use of the Hudumika platform.',
  });
  console.log('Seeded platform page:', terms.slug, '—', terms.status);

  const whyComplyos = await CMSService.upsertPlatformPage(authorId, {
    slug: 'why-complyos',
    title: 'Why ComplyOS',
    content: WHY_COMPLYOS_CONTENT,
    status: 'published',
    seo_description: 'ComplyOS automates BRELA, TRA, NSSF and other Tanzanian regulatory filings.',
  });
  console.log('Seeded platform page:', whyComplyos.slug, '—', whyComplyos.status);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
