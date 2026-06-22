import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginBottom: 36 }}>
    <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>{title}</h2>
    <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.75 }}>{children}</div>
  </section>
);

function DataTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['Category', 'Data Collected', 'Purpose'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', border: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([cat, data, purpose], i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
              <td style={{ padding: '8px 12px', border: '1px solid var(--border)', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{cat}</td>
              <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--ink2)' }}>{data}</td>
              <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--ink3)' }}>{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const PrivacyPolicy: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const dataRows: [string, string, string][] = [
    ['Identity',      'Full name, email address, phone number',                      'Account creation, communication, authentication'],
    ['Organisation',  'Company name, registration number, tax ID, address',          'Billing, compliance, KYC verification'],
    ['Operational',   'Shipment data, manifests, clearance documents, cargo details','Service delivery, customs workflows'],
    ['Financial',     'Invoice data, payment method, transaction history',            'Billing, fraud prevention, financial reporting'],
    ['Technical',     'IP address, browser type, device ID, session tokens',          'Security, authentication, platform performance'],
    ['Usage',         'Feature interactions, page views, error logs',                 'Product improvement, support, analytics'],
    ['Communications','Support tickets, chat messages, emails, WhatsApp messages',    'Customer support, record-keeping'],
  ];

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
          <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--navy)', marginBottom: 10 }}>Privacy Policy</h1>
          <p style={{ fontSize: 14, color: 'var(--ink3)', margin: 0 }}>
            Effective date: <strong>1 January 2025</strong> &nbsp;·&nbsp; Last updated: <strong>1 June 2026</strong>
          </p>
          <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--teal-l)', borderRadius: 9, border: '1px solid var(--teal)22', fontSize: 13, color: 'var(--teal)', lineHeight: 1.6 }}>
            Your privacy matters to us. This policy explains what data we collect, why we collect it, and how we protect it. We never sell your data to third parties.
          </div>
        </div>

        <Section title="1. Who We Are">
          <p><strong>Moovit Logistics Ltd</strong> ("we", "us", "our") is the data controller for personal data processed through the ClearOS platform. We are registered in the United Republic of Tanzania and operate in compliance with applicable data protection legislation.</p>
          <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, lineHeight: 2 }}>
            <strong>Data Controller:</strong> Moovit Logistics Ltd<br />
            <strong>Contact:</strong> <a href="mailto:privacy@moovit.co.tz" style={{ color: 'var(--teal)', fontWeight: 600 }}>privacy@moovit.co.tz</a><br />
            <strong>Address:</strong> P.O. Box 1234, Dar es Salaam, Tanzania
          </div>
        </Section>

        <Section title="2. Data We Collect">
          <p>We collect only the data necessary to provide the ClearOS service. The categories of data we process are:</p>
          <DataTable rows={dataRows} />
          <p style={{ marginTop: 12 }}>We do not collect or process sensitive personal data (such as health, religion, or biometric data) unless explicitly required by a specific feature you enable and with your prior consent.</p>
        </Section>

        <Section title="3. How We Collect Data">
          <p>We collect data through the following means:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li><strong>Direct input:</strong> Information you provide when registering, creating records, or using the platform</li>
            <li><strong>Automated collection:</strong> Technical data automatically gathered when you use the platform (logs, cookies, session data)</li>
            <li><strong>Third-party integrations:</strong> Data shared from systems you connect to ClearOS (e.g., customs portals, shipping lines)</li>
            <li><strong>Public sources:</strong> Business registry data used for KYC and compliance checks</li>
          </ul>
        </Section>

        <Section title="4. Legal Basis for Processing">
          <p>We process your data on the following legal bases:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li><strong>Contractual necessity:</strong> Processing required to deliver the service you have subscribed to</li>
            <li><strong>Legal obligation:</strong> Processing required to comply with customs, tax, or financial regulations</li>
            <li><strong>Legitimate interests:</strong> Security monitoring, fraud prevention, and service improvement</li>
            <li><strong>Consent:</strong> Where we rely on consent (e.g., marketing communications), you may withdraw it at any time</li>
          </ul>
        </Section>

        <Section title="5. How We Use Your Data">
          <p>Your data is used to:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li>Provide, operate, and maintain the ClearOS platform</li>
            <li>Authenticate users and secure your account</li>
            <li>Process payments and manage subscriptions</li>
            <li>Respond to support requests and communications</li>
            <li>Comply with customs, tax, and other regulatory requirements</li>
            <li>Detect and prevent fraud, abuse, or unauthorised access</li>
            <li>Improve platform features through anonymised analytics</li>
            <li>Send transactional emails and, where you have opted in, product updates</li>
          </ul>
          <p style={{ marginTop: 10 }}>We do not use your operational logistics data (shipments, manifests, cargo details) for any purpose other than service delivery.</p>
        </Section>

        <Section title="6. Data Sharing &amp; Disclosure">
          <p>We do not sell, rent, or trade your personal data. We may share data only in these circumstances:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li><strong>Service providers:</strong> Trusted sub-processors (hosting, payment processing, email delivery) bound by data processing agreements</li>
            <li><strong>Regulatory bodies:</strong> Customs authorities, tax agencies, or courts when legally required</li>
            <li><strong>Business transfers:</strong> In the event of a merger or acquisition, with equivalent protections applied</li>
            <li><strong>With your consent:</strong> Any other sharing requires your explicit prior approval</li>
          </ul>
          <p style={{ marginTop: 10 }}>All sub-processors are vetted and contractually bound to process data only as instructed by us.</p>
        </Section>

        <Section title="7. Cookies &amp; Tracking">
          <p>ClearOS uses the following types of cookies:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li><strong>Essential cookies:</strong> Required for authentication and session management — cannot be disabled</li>
            <li><strong>Preference cookies:</strong> Store your settings (theme, language, view preferences)</li>
            <li><strong>Analytics cookies:</strong> Anonymised usage data to improve the platform (opt-out available in Settings)</li>
          </ul>
          <p style={{ marginTop: 10 }}>We do not use advertising or cross-site tracking cookies. You can manage cookie preferences in your browser settings at any time.</p>
        </Section>

        <Section title="8. Data Security">
          <p>We implement industry-standard security measures to protect your data:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li>All data is encrypted in transit (TLS 1.2+) and at rest (AES-256)</li>
            <li>Access to production data is restricted to authorised personnel on a need-to-know basis</li>
            <li>Regular security audits and penetration testing</li>
            <li>Multi-factor authentication available for all accounts</li>
            <li>Automated monitoring for anomalous access patterns</li>
          </ul>
          <p style={{ marginTop: 10 }}>In the event of a data breach that affects your data, we will notify you within 72 hours of becoming aware of it.</p>
        </Section>

        <Section title="9. Data Retention">
          <p>We retain your data for as long as necessary to provide the service and comply with legal obligations:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li><strong>Active account data:</strong> Retained for the duration of your subscription</li>
            <li><strong>Shipment &amp; customs records:</strong> 7 years (regulatory requirement)</li>
            <li><strong>Financial records:</strong> 7 years (tax compliance)</li>
            <li><strong>Support communications:</strong> 3 years</li>
            <li><strong>Technical logs:</strong> 90 days</li>
          </ul>
          <p style={{ marginTop: 10 }}>After the applicable retention period, data is securely deleted or anonymised. You may request early deletion subject to our legal retention obligations.</p>
        </Section>

        <Section title="10. Your Rights">
          <p>Subject to applicable law, you have the following rights regarding your personal data:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
            <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data</li>
            <li><strong>Erasure:</strong> Request deletion of your data (subject to legal retention requirements)</li>
            <li><strong>Portability:</strong> Receive your data in a machine-readable format</li>
            <li><strong>Restriction:</strong> Request that we limit processing of your data in certain circumstances</li>
            <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
            <li><strong>Withdraw consent:</strong> Where processing is based on consent, withdraw it at any time</li>
          </ul>
          <p style={{ marginTop: 10 }}>To exercise any of these rights, contact <a href="mailto:privacy@moovit.co.tz" style={{ color: 'var(--teal)', fontWeight: 600 }}>privacy@moovit.co.tz</a>. We will respond within 30 days. You also have the right to lodge a complaint with the relevant data protection authority.</p>
        </Section>

        <Section title="11. International Transfers">
          <p>ClearOS is hosted on infrastructure based in the East African region. If we transfer your data outside this region (e.g., to a cloud provider with global infrastructure), we ensure appropriate safeguards are in place including standard contractual clauses or equivalent mechanisms.</p>
        </Section>

        <Section title="12. Children's Privacy">
          <p>ClearOS is a business platform intended for use by organisations and professionals aged 18 and above. We do not knowingly collect personal data from individuals under 18. If you believe a minor has provided us with personal data, please contact us immediately.</p>
        </Section>

        <Section title="13. Changes to This Policy">
          <p>We may update this Privacy Policy from time to time to reflect changes in our practices or applicable law. Material changes will be communicated via email and in-app notification. The updated policy will be effective from the date stated at the top of this document.</p>
        </Section>

        <Section title="14. Contact &amp; Complaints">
          <p>For any privacy-related questions, requests, or concerns, please contact our Data Protection Officer:</p>
          <div style={{ marginTop: 12, padding: '16px 20px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, lineHeight: 2 }}>
            <strong>Data Protection Officer</strong><br />
            Moovit Logistics Ltd<br />
            P.O. Box 1234, Dar es Salaam, Tanzania<br />
            Email: <a href="mailto:privacy@moovit.co.tz" style={{ color: 'var(--teal)', fontWeight: 600 }}>privacy@moovit.co.tz</a><br />
            Response time: within 30 days
          </div>
        </Section>

        {/* Footer nav */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>© 2026 ClearOS · Moovit Logistics Ltd. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 18 }}>
            <Link to="/terms" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Terms of Service</Link>
            <Link to="/support/tickets" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
