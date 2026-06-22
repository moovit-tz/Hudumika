import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: 36 }}>
    <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>{title}</h2>
    <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.75 }}>{children}</div>
  </section>
);

export const TermsOfService: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* Minimal top bar */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={() => navigate(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', padding: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>ClearOS · Moovit Logistics</span>
          {!user && (
            <Link to="/" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>Sign in</Link>
          )}
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 28px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Legal</div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--navy)', marginBottom: 10 }}>Terms of Service</h1>
          <p style={{ fontSize: 14, color: 'var(--ink3)', margin: 0 }}>
            Effective date: <strong>1 January 2025</strong> &nbsp;·&nbsp; Last updated: <strong>1 June 2026</strong>
          </p>
          <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--gold-l)', borderRadius: 9, border: '1px solid #fde04788', fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
            Please read these Terms carefully before using ClearOS. By accessing or using our platform you agree to be bound by these Terms. If you do not agree, do not use the service.
          </div>
        </div>

        <Section title="1. Acceptance of Terms">
          <p>These Terms of Service ("Terms") constitute a legally binding agreement between you ("User", "Customer", or "Organisation") and <strong>Moovit Logistics Ltd</strong> ("Company", "we", "us") governing your access to and use of the ClearOS logistics and freight clearance platform ("Service").</p>
          <p style={{ marginTop: 10 }}>By creating an account, accessing the dashboard, or using any feature of ClearOS, you confirm that you have read, understood, and agree to these Terms, as well as our <Link to="/privacy" style={{ color: 'var(--teal)', fontWeight: 600 }}>Privacy Policy</Link>.</p>
        </Section>

        <Section title="2. Description of Service">
          <p>ClearOS is a cloud-based SaaS platform providing logistics management tools including but not limited to:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li>Shipment tracking and freight clearance management</li>
            <li>Demurrage monitoring and container management</li>
            <li>Customer relationship management (CRM)</li>
            <li>Financial tools including billing, invoicing, and expense tracking</li>
            <li>Human resource management (HRM)</li>
            <li>Document management and file storage</li>
            <li>Support ticketing and communication tools</li>
            <li>Analytics and reporting dashboards</li>
          </ul>
          <p style={{ marginTop: 10 }}>We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time with reasonable notice.</p>
        </Section>

        <Section title="3. Account Registration &amp; Security">
          <p>To use ClearOS you must register an account with accurate, current, and complete information. You are responsible for:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li>Maintaining the confidentiality of your login credentials</li>
            <li>All activities that occur under your account</li>
            <li>Promptly notifying us of any unauthorised access or security breach</li>
            <li>Ensuring all team members in your organisation comply with these Terms</li>
          </ul>
          <p style={{ marginTop: 10 }}>Accounts may not be shared between individuals. Each user must have their own credentials. We reserve the right to suspend or terminate accounts that violate this requirement.</p>
        </Section>

        <Section title="4. Subscription Plans &amp; Billing">
          <p>ClearOS operates on a subscription model with tiered plans (Starter, Professional, Enterprise). By subscribing you agree that:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li>Fees are billed monthly or annually in advance, depending on your chosen cycle</li>
            <li>All fees are non-refundable except as required by applicable law or at our sole discretion</li>
            <li>Prices may change with 30 days' written notice; continued use after the notice period constitutes acceptance</li>
            <li>Failure to pay may result in service suspension or termination</li>
            <li>Enterprise plans are subject to a separate Master Service Agreement (MSA)</li>
          </ul>
          <p style={{ marginTop: 10 }}>Applicable taxes (including VAT) are added at checkout based on your billing location.</p>
        </Section>

        <Section title="5. Acceptable Use Policy">
          <p>You agree NOT to use the Service to:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li>Violate any local, national, or international law or regulation</li>
            <li>Transmit any material that is illegal, harmful, fraudulent, or misleading</li>
            <li>Attempt to gain unauthorised access to any system or data</li>
            <li>Interfere with or disrupt the integrity or performance of the Service</li>
            <li>Scrape, reverse-engineer, or replicate any part of the platform</li>
            <li>Upload malware, viruses, or other malicious code</li>
            <li>Impersonate any person or entity</li>
          </ul>
          <p style={{ marginTop: 10 }}>Violation of this policy may result in immediate account suspension without refund and potential legal action.</p>
        </Section>

        <Section title="6. Data &amp; Intellectual Property">
          <p><strong>Your Data:</strong> You retain full ownership of all data you input into ClearOS. By using the Service you grant us a limited, non-exclusive licence to process your data solely for the purpose of providing the Service.</p>
          <p style={{ marginTop: 10 }}><strong>Our IP:</strong> ClearOS, its interface, design, underlying code, brand assets, and all related intellectual property are owned exclusively by Moovit Logistics Ltd and protected under applicable intellectual property law. Nothing in these Terms grants you any right to our IP beyond a limited licence to use the Service.</p>
        </Section>

        <Section title="7. Confidentiality">
          <p>Both parties agree to keep confidential any non-public information disclosed in connection with the Service. This obligation does not apply to information that is publicly available, independently developed, or required to be disclosed by law.</p>
        </Section>

        <Section title="8. Disclaimers &amp; Limitation of Liability">
          <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING FITNESS FOR A PARTICULAR PURPOSE OR NON-INFRINGEMENT.</p>
          <p style={{ marginTop: 10 }}>TO THE MAXIMUM EXTENT PERMITTED BY LAW, MOOVIT LOGISTICS LTD SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOSS OF REVENUE, DATA, OR BUSINESS ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.</p>
          <p style={{ marginTop: 10 }}>Our total aggregate liability to you for any claim arising from or related to these Terms or the Service shall not exceed the total fees paid by you in the 12 months immediately preceding the event giving rise to the claim.</p>
        </Section>

        <Section title="9. Indemnification">
          <p>You agree to indemnify, defend, and hold harmless Moovit Logistics Ltd and its officers, directors, employees, and agents from and against any claims, damages, losses, costs, and expenses (including reasonable legal fees) arising from your use of the Service, violation of these Terms, or infringement of any third-party rights.</p>
        </Section>

        <Section title="10. Termination">
          <p>Either party may terminate the subscription with 30 days' written notice. We may terminate or suspend your account immediately without notice if you breach these Terms. Upon termination:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li>Your right to access the Service ceases immediately</li>
            <li>You may request an export of your data within 30 days of termination</li>
            <li>We will delete your data within 90 days of termination unless legally required to retain it</li>
          </ul>
        </Section>

        <Section title="11. Governing Law &amp; Dispute Resolution">
          <p>These Terms are governed by the laws of the United Republic of Tanzania. Any dispute arising from or relating to these Terms shall first be attempted to be resolved through good-faith negotiation. If unresolved within 30 days, the dispute shall be submitted to binding arbitration under the rules of the Tanzanian Arbitration Centre.</p>
        </Section>

        <Section title="12. Changes to Terms">
          <p>We may update these Terms from time to time. Material changes will be communicated via email and in-app notification at least 30 days before taking effect. Your continued use of the Service after the effective date constitutes acceptance of the revised Terms.</p>
        </Section>

        <Section title="13. Contact Us">
          <p>If you have any questions about these Terms, please contact us:</p>
          <div style={{ marginTop: 12, padding: '16px 20px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, lineHeight: 2 }}>
            <strong>Moovit Logistics Ltd</strong><br />
            Legal Department<br />
            P.O. Box 1234, Dar es Salaam, Tanzania<br />
            Email: <a href="mailto:legal@moovit.co.tz" style={{ color: 'var(--teal)', fontWeight: 600 }}>legal@moovit.co.tz</a><br />
            Phone: +255 800 000 123
          </div>
        </Section>

        {/* Footer nav */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>© 2026 ClearOS · Moovit Logistics Ltd. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 18 }}>
            <Link to="/privacy" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/support/tickets" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
